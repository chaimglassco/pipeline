import handler from "../../../../api/storage-upload";

// Preserve the existing Node request/response contract and database implementation.
export const config = { api: { bodyParser: false, responseLimit: false } };
export default handler;
