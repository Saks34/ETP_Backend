// Centralized collection names for ClassBridge platform
// One database: classbridge_platform
// Vertical-specific collections must include vertical context

module.exports = {
  // Platform-wide
  USERS: 'users',
  INSTITUTIONS: 'institutions',

  // ClassBridge vertical
  CB_TIMETABLES: 'classbridge_timetables',
  CB_LIVE_CLASSES: 'classbridge_live_classes',
  CB_NOTES: 'classbridge_notes',
  CB_CHATS: 'classbridge_chats',
  CB_RESOURCES: 'classbridge_resources',
  CB_LIVECLASS_STATES: 'classbridge_liveclass_states',
  CB_POLLS: 'classbridge_polls',
};
