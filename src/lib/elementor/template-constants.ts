/**
 * Star Wars themed constants for Elementor Template Customization Module
 * Matches Death Star module terminology and styling
 */

// Star Wars themed step labels
export const ELEMENTOR_STEPS = [
  { key: 'configure', label: 'Configure Target', shortLabel: 'Configure', progress: 5 },
  { key: 'acquire', label: 'Acquiring Template', shortLabel: 'Acquire', progress: 15 },
  { key: 'scan', label: 'Scanning Structure', shortLabel: 'Scan', progress: 30 },
  { key: 'identify', label: 'Identifying Targets', shortLabel: 'Identify', progress: 50 },
  { key: 'lock', label: 'Locking Coordinates', shortLabel: 'Lock', progress: 70 },
  { key: 'charge', label: 'Charging Modification Sequence', shortLabel: 'Charge', progress: 85 },
  { key: 'fire', label: 'Firing Updates', shortLabel: 'Fire', progress: 95 },
  { key: 'complete', label: 'Target Customized', shortLabel: 'Complete', progress: 100 },
] as const;

// Step terminology mapping (Star Wars themed)
export const getStepTerminology = (step: string): string => {
  const stepLower = step.toLowerCase();
  if (stepLower.includes('configure') || stepLower.includes('config')) {
    return 'Configure Target';
  }
  if (stepLower.includes('acquire') || stepLower.includes('select') || stepLower.includes('load')) {
    return 'Acquiring Template';
  }
  if (stepLower.includes('scan') || stepLower.includes('analyze') || stepLower.includes('structure')) {
    return 'Scanning Structure';
  }
  if (stepLower.includes('identify') || stepLower.includes('target') || stepLower.includes('field')) {
    return 'Identifying Targets';
  }
  if (stepLower.includes('lock') || stepLower.includes('approve') || stepLower.includes('review')) {
    return 'Locking Coordinates';
  }
  if (stepLower.includes('charge') || stepLower.includes('prepare') || stepLower.includes('modify')) {
    return 'Charging Modification Sequence';
  }
  if (stepLower.includes('fire') || stepLower.includes('apply') || stepLower.includes('update')) {
    return 'Firing Updates';
  }
  if (stepLower.includes('complete') || stepLower.includes('done') || stepLower.includes('finish')) {
    return 'Target Customized';
  }
  return step;
};

// Map step name to progress percentage
export const getStepProgress = (step: string): number => {
  const stepLower = step.toLowerCase();
  if (stepLower.includes('configure') || stepLower.includes('config')) return 5;
  if (stepLower.includes('acquire') || stepLower.includes('select') || stepLower.includes('load')) return 15;
  if (stepLower.includes('scan') || stepLower.includes('analyze') || stepLower.includes('structure')) return 30;
  if (stepLower.includes('identify') || stepLower.includes('target') || stepLower.includes('field')) return 50;
  if (stepLower.includes('lock') || stepLower.includes('approve') || stepLower.includes('review')) return 70;
  if (stepLower.includes('charge') || stepLower.includes('prepare') || stepLower.includes('modify')) return 85;
  if (stepLower.includes('fire') || stepLower.includes('apply') || stepLower.includes('update')) return 95;
  if (stepLower.includes('complete') || stepLower.includes('done') || stepLower.includes('finish')) return 100;
  return 0;
};

// Field type icons (Star Wars themed)
export const FIELD_TYPE_ICONS: Record<string, string> = {
  url: '🌐',
  email: '📧',
  phone: '📞',
  color: '🎨',
  text: '📝',
  business_name: '🏢',
  address: '📍',
  other: '⚙️',
};

// Field type labels
export const FIELD_TYPE_LABELS: Record<string, string> = {
  url: 'Site URL',
  email: 'Email Address',
  phone: 'Phone Number',
  color: 'Brand Color',
  text: 'Text Content',
  business_name: 'Business Name',
  address: 'Address',
  other: 'Other Field',
};

// Star Wars themed messages
export const ELEMENTOR_MESSAGES = {
  configuring: 'Configuring target parameters...',
  acquiring: 'Acquiring template structure...',
  scanning: 'Scanning template files for customizable fields...',
  identifying: 'Identifying targets for modification...',
  locking: 'Locking coordinates for updates...',
  charging: 'Charging modification sequence...',
  firing: 'Firing updates to template files...',
  complete: 'Target successfully customized!',
  error: 'Target deflection detected. Review errors and retry.',
} as const;
