import type { Settings } from '../src/shared/types';

export function defaultSettingsForTest(): Settings {
  return {
    setupComplete: true,
    profile: {
      title: 'Detective', fullName: 'Pat Example', badgeNumber: 'B123', phone: '(530) 555-0100', email: 'pat@example.gov',
      unit: 'High Tech Unit', agencyName: "El Dorado County Sheriff's Office", agencyShortName: 'EDSO', county: 'El Dorado',
      state: 'California', courtName: 'Superior Court of California, County of El Dorado',
    },
    notifications: { methods: ['desktop'], leadTimes: [7, 3, 1, 0], overdueDaily: true, digestEnabled: false, digestHour: 7, recipient: '' },
    smtp: { host: '', port: 587, security: 'starttls', username: '', from: '', allowSelfSigned: false, hasPassword: false },
    app: {
      theme: 'dark', minimizeToTray: true, startOnLogin: false, startMinimized: false, lockEnabled: false, lockMinutes: 15, hasPin: false,
      outputFolder: '', askWhereToSave: true, archiveOnReturn: true, dateFormat: 'MM/DD/YYYY',
    },
    signature: { hasSignature: false, widthInches: 2, useByDefault: true, updatedAt: null },
    dueRules: [{ id: 'r10', name: '10 days', days: 10, dayType: 'calendar' }],
    holidays: [],
    backup: { autoDaily: true, keep: 14, folder: '', lastBackupAt: null },
  };
}
