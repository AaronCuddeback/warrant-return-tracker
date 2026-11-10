import type { Api } from './types';

type InvokeName = Exclude<keyof Api, 'onNavigate' | 'onDataChanged' | 'onLock' | 'onSettingsChanged' | 'getPathForFile'>;

/** Every IPC method the preload bridge forwards to the main process. */
export const API_METHODS = [
  'appInfo', 'getSettings', 'saveSettings', 'setSmtpPassword', 'setPin', 'verifyPin', 'setSignature', 'getSignature', 'templateUsesSignature',
  'listWarrants', 'getWarrant', 'createWarrant', 'updateWarrant', 'setStatus', 'extendDueDate', 'snooze',
  'trashWarrant', 'restoreWarrant', 'purgeWarrant', 'findDuplicates', 'stats',
  'listAttachments', 'addAttachments', 'readAttachment', 'saveAttachmentAs', 'openAttachment', 'removeAttachment',
  'verifyAttachment', 'pickFile', 'readFileBytes',
  'audit', 'listAmendments', 'saveAmendment', 'deleteAmendment',
  'listTemplates', 'importTemplate', 'updateTemplate', 'replaceTemplateFile', 'deleteTemplate', 'duplicateTemplate',
  'inspectTemplate', 'exportTemplate', 'testTemplate', 'templateFieldCatalog', 'generateDocument',
  'sendTestEmail', 'sendReminderNow', 'runReminderCheck', 'testDesktopNotification', 'exportIcs',
  'exportCsv', 'docketPdf', 'caseSummaryPdf', 'casePacket', 'auditCsv',
  'backupNow', 'exportFullBackup', 'restoreFullBackup', 'importV1', 'chooseFolder', 'openDataFolder', 'showInFolder',
  'openPath', 'setAgencyLogo', 'getAgencyLogo', 'setTitleBarTheme', 'extractDocxText', 'setUiScale',
] as const satisfies readonly InvokeName[];

// Compile-time check that the list is complete.
type Missing = Exclude<InvokeName, (typeof API_METHODS)[number]>;
export const _complete: Missing extends never ? true : Missing = true;
