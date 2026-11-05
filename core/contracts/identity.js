// Transitional host contract. getAPI/getAuthToken preserve trusted legacy apps;
// future isolated apps consume a broker instead of receiving this provider.
export const IDENTITY_V1_METHODS = Object.freeze([
    'getCurrentUser', 'getAuthToken', 'login', 'logout', 'getAPI',
    'getProviderInfo', 'on', 'off', 'destroy'
]);
