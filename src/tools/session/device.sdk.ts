/**
 * Proof-of-concept: `appium_device` tool ported from fastmcp to the raw
 * `@modelcontextprotocol/sdk`. This file exists solely to compare line count,
 * ergonomics, and capability (specifically `structuredContent` / `outputSchema`)
 * against the fastmcp version in `./device.ts`.
 *
 * NOT wired into `src/tools/index.ts`. Not exercised by the running server.
 * To try it end-to-end you would construct an `McpServer` from the SDK and
 * call `registerDeviceTool(server)` instead of `device(server)`.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  CallToolResult,
  ServerNotification,
  ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import { z } from 'zod';
import {
  getDriver,
  getPlatformName,
  isAndroidUiautomator2DriverSession,
  isRemoteDriverSession,
  isXCUITestDriverSession,
  PLATFORM,
} from '../../session-store.js';
import { execute } from '../../command.js';
import { BatteryState } from 'appium-xcuitest-driver/build/lib/commands/enum.js';
import type { AndroidUiautomator2Driver } from 'appium-uiautomator2-driver';

const IOS_BATTERY_STATES: Record<number, string> = {
  [BatteryState.UIDeviceBatteryStateUnknown]: 'unknown',
  [BatteryState.UIDeviceBatteryStateUnplugged]: 'unplugged',
  [BatteryState.UIDeviceBatteryStateCharging]: 'charging',
  [BatteryState.UIDeviceBatteryStateFull]: 'full',
};

const ANDROID_BATTERY_STATES: Record<number, string> = {
  1: 'unknown',
  2: 'charging',
  3: 'discharging',
  4: 'not charging',
  5: 'full',
};

type BatteryInfo = {
  platform: 'iOS' | 'Android';
  levelPercent: number;
  state: string;
};

function formatBatteryInfo(
  platform: string,
  raw: { level?: number; state?: number }
): BatteryInfo {
  const levelPercent = Math.round((raw.level ?? 0) * 100);
  const states =
    platform === PLATFORM.ios ? IOS_BATTERY_STATES : ANDROID_BATTERY_STATES;
  return {
    platform: platform === PLATFORM.ios ? 'iOS' : 'Android',
    levelPercent,
    state: states[raw.state ?? -1] ?? 'unknown',
  };
}

const inputSchema = {
  action: z
    .enum([
      'info',
      'battery',
      'time',
      'shake',
      'lock',
      'unlock',
      'notifications',
    ])
    .describe(
      'Action to perform. ' +
        'info: device model/OS/locale/etc. ' +
        'battery: battery level and charging state. ' +
        'time: current device time (optional format). ' +
        'shake: perform a shake gesture (iOS XCUITest only). ' +
        'lock: lock the device (optional seconds for auto-unlock). ' +
        'unlock: unlock the device. ' +
        'notifications: open the Android notifications panel (Android only).'
    ),
  format: z
    .string()
    .optional()
    .describe(
      'Used with: time. moment.js format string for the returned time. Defaults to ISO 8601.'
    ),
  seconds: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      'Used with: lock. How long to lock the screen before auto-unlock. If omitted, stays locked until action=unlock.'
    ),
  sessionId: z
    .string()
    .optional()
    .describe('Session ID to target. If omitted, uses the active session.'),
};

const outputSchema = {
  action: z.enum([
    'info',
    'battery',
    'time',
    'shake',
    'lock',
    'unlock',
    'notifications',
  ]),
  success: z.boolean(),
  message: z.string(),
  info: z.record(z.string(), z.unknown()).optional(),
  battery: z
    .object({
      platform: z.enum(['iOS', 'Android']),
      levelPercent: z.number().min(0).max(100),
      state: z.string(),
    })
    .optional(),
  time: z.string().optional(),
  lockSeconds: z.number().int().optional(),
};

type DeviceArgs = {
  action:
    | 'info'
    | 'battery'
    | 'time'
    | 'shake'
    | 'lock'
    | 'unlock'
    | 'notifications';
  format?: string;
  seconds?: number;
  sessionId?: string;
};

type DeviceOutput = {
  action: DeviceArgs['action'];
  success: boolean;
  message: string;
  info?: Record<string, unknown>;
  battery?: BatteryInfo;
  time?: string;
  lockSeconds?: number;
};

function toResult(out: DeviceOutput, isError = false): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(out, null, 2) }],
    structuredContent: out as unknown as { [k: string]: unknown },
    ...(isError && { isError }),
  };
}

async function handleInfo(args: DeviceArgs): Promise<DeviceOutput> {
  const driver = getDriver(args.sessionId)!;
  const info = (await execute(driver, 'mobile: deviceInfo', {})) as Record<
    string,
    unknown
  >;
  return { action: 'info', success: true, message: 'Device info retrieved.', info };
}

async function handleBattery(args: DeviceArgs): Promise<DeviceOutput> {
  const driver = getDriver(args.sessionId)!;
  const platform = getPlatformName(driver);
  const raw = await execute(driver, 'mobile: batteryInfo', {});
  const battery = formatBatteryInfo(platform, raw);
  return {
    action: 'battery',
    success: true,
    message: `Battery ${battery.levelPercent}% (${battery.state}).`,
    battery,
  };
}

async function handleTime(args: DeviceArgs): Promise<DeviceOutput> {
  const driver = getDriver(args.sessionId)!;
  const params: Record<string, unknown> = {};
  if (args.format != null) {
    params.format = args.format;
  }
  const time = String(await execute(driver, 'mobile: getDeviceTime', params));
  return { action: 'time', success: true, message: time, time };
}

async function handleShake(args: DeviceArgs): Promise<DeviceOutput> {
  const driver = getDriver(args.sessionId)!;
  if (!isXCUITestDriverSession(driver)) {
    return {
      action: 'shake',
      success: false,
      message:
        'Shake is supported only with XCUITest driver sessions. Other driver types are not supported.',
    };
  }
  await (driver as unknown as { mobileShake(): Promise<void> }).mobileShake();
  return { action: 'shake', success: true, message: 'Shake action performed.' };
}

async function handleLock(args: DeviceArgs): Promise<DeviceOutput> {
  const driver = getDriver(args.sessionId)!;
  const params: { seconds?: number } = {};
  if (args.seconds !== undefined) {
    params.seconds = args.seconds;
  }
  await execute(driver, 'mobile: lock', params);
  return {
    action: 'lock',
    success: true,
    message:
      args.seconds !== undefined
        ? `Device locked for ${args.seconds} second(s).`
        : 'Device locked.',
    ...(args.seconds !== undefined && { lockSeconds: args.seconds }),
  };
}

async function handleUnlock(args: DeviceArgs): Promise<DeviceOutput> {
  const driver = getDriver(args.sessionId)!;
  await execute(driver, 'mobile: unlock', {});
  return { action: 'unlock', success: true, message: 'Device unlocked.' };
}

async function handleNotifications(args: DeviceArgs): Promise<DeviceOutput> {
  const driver = getDriver(args.sessionId)!;
  const platform = getPlatformName(driver);
  if (platform !== PLATFORM.android) {
    return {
      action: 'notifications',
      success: false,
      message: `Unsupported platform: ${platform}. Open notifications is supported on Android only.`,
    };
  }
  if (isAndroidUiautomator2DriverSession(driver)) {
    await (driver as AndroidUiautomator2Driver).openNotifications();
  } else if (isRemoteDriverSession(driver)) {
    await execute(driver, 'mobile: openNotifications', {});
  } else {
    throw new Error('Unsupported Android driver for open notifications');
  }
  return {
    action: 'notifications',
    success: true,
    message: 'Successfully opened notifications panel.',
  };
}

export default function registerDeviceTool(server: McpServer): void {
  server.registerTool(
    'appium_device',
    {
      description:
        'Device management: query device state (info, battery, time) or perform device actions (shake, lock, unlock, open notifications). Use the "action" parameter to select the operation. Works on iOS and Android except where noted: shake is iOS XCUITest only; notifications is Android only.',
      inputSchema,
      outputSchema,
      annotations: {
        readOnlyHint: false,
        openWorldHint: false,
      },
    },
    async (
      args: DeviceArgs,
      _extra: RequestHandlerExtra<ServerRequest, ServerNotification>
    ): Promise<CallToolResult> => {
      const driver = getDriver(args.sessionId);
      if (!driver) {
        return toResult(
          { action: args.action, success: false, message: 'No driver found' },
          true
        );
      }
      try {
        switch (args.action) {
          case 'info':
            return toResult(await handleInfo(args));
          case 'battery':
            return toResult(await handleBattery(args));
          case 'time':
            return toResult(await handleTime(args));
          case 'shake':
            return toResult(await handleShake(args));
          case 'lock':
            return toResult(await handleLock(args));
          case 'unlock':
            return toResult(await handleUnlock(args));
          case 'notifications':
            return toResult(await handleNotifications(args));
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return toResult(
          {
            action: args.action,
            success: false,
            message: `Failed to perform ${args.action}. err: ${message}`,
          },
          true
        );
      }
    }
  );
}
