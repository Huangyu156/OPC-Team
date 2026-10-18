import type { AppearanceSurfaceDescriptor } from '@/infrastructure/appearance';

export const applicationSettingsAppearanceDescriptor: AppearanceSurfaceDescriptor = {
  id: 'application-settings',
  parts: [
    { id: 'root' }, { id: 'launchAtLogin' }, { id: 'preventSleep' },
    { id: 'logging' }, { id: 'logPath' }, { id: 'terminal' },
    { id: 'windowBehavior' }, { id: 'notifications' },
    { id: 'assistant-storage' }, { id: 'assistantStoragePath' },
    { id: 'assistantActiveRoot' }, { id: 'assistantLegacyRoot' },
  ],
};
