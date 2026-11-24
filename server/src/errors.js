// Named errors. The API maps `status` to the HTTP status and answers { error: code, message }.
export class LabError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'LabError';
    this.code = code;
    this.status = status;
  }
}
export const invalidConfig = (message) => new LabError('invalid_config', message);
export const invalidRequest = (message) => new LabError('invalid_request', message);
export const invalidPrompt = (message) => new LabError('invalid_prompt', message);
// The vector-store stand-in is down. UNVERIFIED which behaviour the product has (serve from the model, or refuse): the lab names the error and claims neither.
export const storeUnavailable = (storeId) => new LabError('vector_store_unavailable', `the vector store stand-in "${storeId}" is unavailable`, 503);
