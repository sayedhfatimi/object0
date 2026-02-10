const PREFIX = "object-toolbar:";

export const OBJECT_TOOLBAR_EVENTS = {
  OPEN_SEARCH: `${PREFIX}open-search`,
  UPLOAD_FILES: `${PREFIX}upload-files`,
  UPLOAD_FOLDER: `${PREFIX}upload-folder`,
  NEW_FOLDER: `${PREFIX}new-folder`,
  DOWNLOAD_SELECTION: `${PREFIX}download-selection`,
  DELETE_SELECTION: `${PREFIX}delete-selection`,
  REFRESH_OBJECTS: `${PREFIX}refresh-objects`,
  OPEN_SYNC: `${PREFIX}open-sync`,
  OPEN_TRANSFER: `${PREFIX}open-transfer`,
  SHARE_SELECTION: `${PREFIX}share-selection`,
} as const;

export type ObjectToolbarEventName =
  (typeof OBJECT_TOOLBAR_EVENTS)[keyof typeof OBJECT_TOOLBAR_EVENTS];

export function dispatchObjectToolbarEvent(name: ObjectToolbarEventName) {
  window.dispatchEvent(new Event(name));
}
