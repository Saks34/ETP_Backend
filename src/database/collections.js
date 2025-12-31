// Centralized collection names for ETP platform
// One database: etp_platform
// Vertical-specific collections must include vertical context

module.exports = {
  // Platform-wide
  USERS: 'users',
  INSTITUTIONS: 'institutions',

  // TeachFlow vertical
  TF_TIMETABLES: 'teachflow_timetables',
  TF_LIVE_CLASSES: 'teachflow_live_classes',
  TF_NOTES: 'teachflow_notes',
  TF_CHATS: 'teachflow_chats',
  TF_RESOURCES: 'teachflow_resources',
  TF_LIVECLASS_STATES: 'teachflow_liveclass_states',
};
