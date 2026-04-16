import { describe, test, expect, jest } from '@jest/globals';

jest.unstable_mockModule('../../../session-store', () => ({
  getDriver: jest.fn(),
  getPlatformName: jest.fn(),
  PLATFORM: { ios: 'iOS', android: 'Android' },
}));

jest.unstable_mockModule('../../../command', () => ({
  execute: jest.fn(),
}));

jest.unstable_mockModule('../../../logger', () => ({
  default: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
}));

const {
  getDriver,
  getPlatformName,
  isXCUITestDriverSession,
  isAndroidUiautomator2DriverSession,
  isRemoteDriverSession,
  PLATFORM,
} = await import('../../../session-store.js');
const { execute } = await import('../../../command.js');

const mockGetDriver = getDriver as jest.MockedFunction<typeof getDriver>;
const mockGetPlatformName = getPlatformName as jest.MockedFunction<
  typeof getPlatformName
>;
const mockIsXCUITest = isXCUITestDriverSession as jest.MockedFunction<
  typeof isXCUITestDriverSession
>;
const mockIsUia2 =
  isAndroidUiautomator2DriverSession as jest.MockedFunction<
    typeof isAndroidUiautomator2DriverSession
  >;
const mockIsRemote = isRemoteDriverSession as jest.MockedFunction<
  typeof isRemoteDriverSession
>;
const mockExecute = execute as jest.MockedFunction<typeof execute>;

describe('appium_mobile_device_info tool', () => {
  const mockServer = { addTool: jest.fn() } as any;

  async function getToolExecute() {
    const { default: deviceInfo } =
      await import('../../../tools/session/device-info.js');
    deviceInfo(mockServer);
    return (mockServer.addTool as jest.MockedFunction<any>).mock.calls.at(
      -1
    )?.[0];
  }

  describe('battery action', () => {
    test('returns error when no driver is active', async () => {
      const tool = await getToolExecute();
      mockGetDriver.mockReturnValue(null as any);
      const result = await tool.execute({ action: 'battery' }, undefined);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('No driver found');
    });

    test('returns formatted iOS battery info', async () => {
      const tool = await getToolExecute();
      mockGetDriver.mockReturnValue({} as any);
      mockGetPlatformName.mockReturnValue(PLATFORM.ios);
      mockExecute.mockResolvedValue({ level: 0.75, state: 2 } as any);

      const result = await tool.execute({ action: 'battery' }, undefined);

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toEqual({
        platform: 'iOS',
        level: '75%',
        state: 'charging',
      });
    });

    test('returns formatted Android battery info', async () => {
      const tool = await getToolExecute();
      mockGetDriver.mockReturnValue({} as any);
      mockGetPlatformName.mockReturnValue(PLATFORM.android);
      mockExecute.mockResolvedValue({ level: 0.3, state: 3 } as any);

      const result = await tool.execute({ action: 'battery' }, undefined);

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toEqual({
        platform: 'Android',
        level: '30%',
        state: 'discharging',
      });
    });

    test('returns error when execute rejects', async () => {
      const tool = await getToolExecute();
      mockGetDriver.mockReturnValue({} as any);
      mockGetPlatformName.mockReturnValue(PLATFORM.ios);
      mockExecute.mockRejectedValue(new Error('driver error'));

      const result = await tool.execute({ action: 'battery' }, undefined);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe(
        'Failed to get battery info: driver error'
      );
    });
  });

  describe('info action', () => {
    test('returns error when no driver is active', async () => {
      const tool = await getToolExecute();
      mockGetDriver.mockReturnValue(null as any);
      const result = await tool.execute({ action: 'info' }, undefined);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('No driver found');
    });

    test('returns device info as formatted JSON', async () => {
      const tool = await getToolExecute();
      mockGetDriver.mockReturnValue({} as any);
      const deviceData = {
        model: 'iPhone 15',
        os: 'iOS 17.0',
        locale: 'en_US',
      };
      mockExecute.mockResolvedValue(deviceData as any);

      const result = await tool.execute({ action: 'info' }, undefined);

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toEqual(deviceData);
    });

    test('returns error when execute rejects', async () => {
      const tool = await getToolExecute();
      mockGetDriver.mockReturnValue({} as any);
      mockExecute.mockRejectedValue(new Error('device unavailable'));

      const result = await tool.execute({ action: 'info' }, undefined);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe(
        'Failed to get device info: device unavailable'
      );
    });
  });

  describe('time action', () => {
    test('returns error when no driver is active', async () => {
      const tool = await getToolExecute();
      mockGetDriver.mockReturnValue(null as any);
      const result = await tool.execute({ action: 'time' }, undefined);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('No driver found');
    });

    test('returns device time as string', async () => {
      const tool = await getToolExecute();
      mockGetDriver.mockReturnValue({} as any);
      mockExecute.mockResolvedValue('2024-01-15T10:30:00+00:00' as any);

      const result = await tool.execute({ action: 'time' }, undefined);

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toBe('2024-01-15T10:30:00+00:00');
    });

    test('passes format parameter to execute', async () => {
      const tool = await getToolExecute();
      mockGetDriver.mockReturnValue({} as any);
      mockExecute.mockResolvedValue('15/01/2024' as any);

      const result = await tool.execute(
        { action: 'time', format: 'DD/MM/YYYY' },
        undefined
      );

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toBe('15/01/2024');
      expect(mockExecute).toHaveBeenCalledWith(
        expect.anything(),
        'mobile: getDeviceTime',
        { format: 'DD/MM/YYYY' }
      );
    });

    test('returns error when execute rejects', async () => {
      const tool = await getToolExecute();
      mockGetDriver.mockReturnValue({} as any);
      mockExecute.mockRejectedValue(new Error('timeout'));

      const result = await tool.execute({ action: 'time' }, undefined);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Failed to get device time: timeout');
    });
  });

  describe('shake action', () => {
    test('performs shake on XCUITest session', async () => {
      const tool = await getToolExecute();
      const mobileShake = jest.fn();
      mockGetDriver.mockReturnValue({ mobileShake } as any);
      mockIsXCUITest.mockReturnValue(true);

      const result = await tool.execute({ action: 'shake' }, undefined);

      expect(mobileShake).toHaveBeenCalledTimes(1);
      expect(result.content[0].text).toBe('Shake action performed.');
    });

    test('returns unsupported message for non-XCUITest session', async () => {
      const tool = await getToolExecute();
      mockGetDriver.mockReturnValue({} as any);
      mockIsXCUITest.mockReturnValue(false);

      const result = await tool.execute({ action: 'shake' }, undefined);

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toBe(
        'Shake is supported only with XCUITest driver sessions. Other driver types are not supported.'
      );
    });
  });

  describe('lock action', () => {
    test('locks indefinitely when seconds omitted', async () => {
      const tool = await getToolExecute();
      mockGetDriver.mockReturnValue({} as any);
      mockExecute.mockResolvedValue(undefined as any);

      const result = await tool.execute({ action: 'lock' }, undefined);

      expect(mockExecute).toHaveBeenCalledWith(
        expect.anything(),
        'mobile: lock',
        {}
      );
      expect(result.content[0].text).toBe('Device locked.');
    });

    test('passes seconds to execute when provided', async () => {
      const tool = await getToolExecute();
      mockGetDriver.mockReturnValue({} as any);
      mockExecute.mockResolvedValue(undefined as any);

      const result = await tool.execute(
        { action: 'lock', seconds: 5 },
        undefined
      );

      expect(mockExecute).toHaveBeenCalledWith(
        expect.anything(),
        'mobile: lock',
        { seconds: 5 }
      );
      expect(result.content[0].text).toBe('Device locked for 5 second(s).');
    });

    test('returns error when execute rejects', async () => {
      const tool = await getToolExecute();
      mockGetDriver.mockReturnValue({} as any);
      mockExecute.mockRejectedValue(new Error('lock failed'));

      const result = await tool.execute({ action: 'lock' }, undefined);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe(
        'Failed to perform lock. err: lock failed'
      );
    });
  });

  describe('unlock action', () => {
    test('unlocks the device', async () => {
      const tool = await getToolExecute();
      mockGetDriver.mockReturnValue({} as any);
      mockExecute.mockResolvedValue(undefined as any);

      const result = await tool.execute({ action: 'unlock' }, undefined);

      expect(mockExecute).toHaveBeenCalledWith(
        expect.anything(),
        'mobile: unlock',
        {}
      );
      expect(result.content[0].text).toBe('Device unlocked.');
    });

    test('returns error when execute rejects', async () => {
      const tool = await getToolExecute();
      mockGetDriver.mockReturnValue({} as any);
      mockExecute.mockRejectedValue(new Error('unlock failed'));

      const result = await tool.execute({ action: 'unlock' }, undefined);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe(
        'Failed to perform unlock. err: unlock failed'
      );
    });
  });

  describe('notifications action', () => {
    test('returns unsupported message on iOS', async () => {
      const tool = await getToolExecute();
      mockGetDriver.mockReturnValue({} as any);
      mockGetPlatformName.mockReturnValue(PLATFORM.ios);

      const result = await tool.execute(
        { action: 'notifications' },
        undefined
      );

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toBe(
        'Unsupported platform: iOS. Open notifications is supported on Android only.'
      );
    });

    test('opens notifications on Android UiAutomator2', async () => {
      const tool = await getToolExecute();
      const openNotifications = jest.fn();
      mockGetDriver.mockReturnValue({ openNotifications } as any);
      mockGetPlatformName.mockReturnValue(PLATFORM.android);
      mockIsUia2.mockReturnValue(true);

      const result = await tool.execute(
        { action: 'notifications' },
        undefined
      );

      expect(openNotifications).toHaveBeenCalledTimes(1);
      expect(result.content[0].text).toBe(
        'Successfully opened notifications panel.'
      );
    });

    test('opens notifications on Android remote driver via execute', async () => {
      const tool = await getToolExecute();
      mockGetDriver.mockReturnValue({} as any);
      mockGetPlatformName.mockReturnValue(PLATFORM.android);
      mockIsUia2.mockReturnValue(false);
      mockIsRemote.mockReturnValue(true);
      mockExecute.mockResolvedValue(undefined as any);

      const result = await tool.execute(
        { action: 'notifications' },
        undefined
      );

      expect(mockExecute).toHaveBeenCalledWith(
        expect.anything(),
        'mobile: openNotifications',
        {}
      );
      expect(result.content[0].text).toBe(
        'Successfully opened notifications panel.'
      );
    });
  });
});
