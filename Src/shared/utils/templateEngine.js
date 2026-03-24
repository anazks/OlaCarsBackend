/**
 * Simple Template Engine for Agreement Placeholders
 * Replaces {{TAG}} with values from the provided data object.
 */
const replacePlaceholders = (content, data) => {
    if (!content) return content;
    
    // Regex to match {{PLACEHOLDER_NAME}}
    return content.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, tag) => {
        // Return the value from data, or the original tag if not found
        return data.hasOwnProperty(tag) ? data[tag] : match;
    });
};

const AVAILABLE_PLACEHOLDERS = {
    // Driver Details
    DRIVER_NAME: "Full name of the driver",
    DRIVER_EMAIL: "Email address of the driver",
    DRIVER_PHONE: "Phone number of the driver",
    DRIVER_NATIONALITY: "Nationality of the driver",
    DRIVER_DOB: "Date of birth (YYYY-MM-DD)",
    DRIVER_LICENSE_NUMBER: "Driving license number",
    DRIVER_LICENSE_EXPIRY: "Driving license expiry date",
    DRIVER_ID_NUMBER: "National ID or Passport number",
    
    // Vehicle Details
    VEHICLE_MAKE: "Vehicle manufacturer (e.g., Toyota)",
    VEHICLE_MODEL: "Vehicle model (e.g., Camry)",
    VEHICLE_YEAR: "Vehicle manufacture year",
    VEHICLE_COLOR: "Vehicle exterior color",
    VEHICLE_VIN: "Vehicle Identification Number",
    VEHICLE_PLATE: "Vehicle registration/plate number",
    
    // General
    CURRENT_DATE: "Today's date (formatted)",
    BRANCH_NAME: "Name of the assigned branch",
    
    // Lease details (New)
    LEASE_DURATION: "Duration of the lease in months",
    LEASE_MONTHLY_RENT: "Monthly rent amount for the vehicle",
}; 

module.exports = {
    replacePlaceholders,
    AVAILABLE_PLACEHOLDERS
};
