export function unavailable(message) {
    const error = new Error(message);
    /** @type {any} */ (error).code = 'CAPABILITY_UNAVAILABLE';
    return error;
}
