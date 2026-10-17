import type { AppearanceSurfaceDescriptor } from '@/infrastructure/appearance';

export const aboutDialogAppearanceDescriptor: AppearanceSurfaceDescriptor = {
  id: 'about-dialog',
  parts: [
    // Modal owns the dialog shell; this root is content inside that shell.
    { id: 'root', visualRole: 'content', continuityGroup: 'about-dialog' },
    { id: 'hero', visualRole: 'content', continuityGroup: 'about-dialog' },
    { id: 'title', propertyProfile: 'paint', visualRole: 'content' },
    { id: 'content', visualRole: 'content', continuityGroup: 'about-dialog' },
    { id: 'channelBadge', propertyProfile: 'paint', visualRole: 'content' },
    { id: 'infoRow', visualRole: 'content' },
    { id: 'infoLabel', propertyProfile: 'paint', visualRole: 'content' },
    { id: 'infoValue', propertyProfile: 'paint', visualRole: 'content' },
    { id: 'copyButton', propertyProfile: 'control', visualRole: 'control' },
    { id: 'starCallout', visualRole: 'toolbar', continuityGroup: 'about-dialog' },
    { id: 'footer', visualRole: 'toolbar', continuityGroup: 'about-dialog' },
    { id: 'license', propertyProfile: 'paint', visualRole: 'content' },
    { id: 'copyright', propertyProfile: 'paint', visualRole: 'content' },
  ],
};
