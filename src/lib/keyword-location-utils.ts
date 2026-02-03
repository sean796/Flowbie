// US States - defined outside component to avoid recreation
export const usStates = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
  "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
  "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan",
  "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
  "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma",
  "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee",
  "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming"
];

// Canadian Provinces - defined outside component to avoid recreation
export const canadianProvinces = [
  "Alberta", "British Columbia", "Manitoba", "New Brunswick", "Newfoundland and Labrador",
  "Northwest Territories", "Nova Scotia", "Nunavut", "Ontario", "Prince Edward Island",
  "Quebec", "Saskatchewan", "Yukon"
];

/**
 * Compute location string for API calls
 * Format: "City,State/Province,Country" or "State/Province,Country" or "Country"
 */
export function computeLocationString(
  city: string,
  stateProvince: string,
  country: "United States" | "Canada"
): string {
  const parts: string[] = [];
  
  // Add city if provided
  if (city && city.trim()) {
    parts.push(city.trim());
  }
  
  // Add state/province if provided
  if (stateProvince && stateProvince !== "__all__") {
    parts.push(stateProvince);
  }
  
  // Always add country
  parts.push(country);
  
  return parts.join(",");
}

/**
 * Get location options (states or provinces) based on country
 */
export function getLocationOptions(country: "United States" | "Canada"): string[] {
  return country === "United States" ? usStates : canadianProvinces;
}

