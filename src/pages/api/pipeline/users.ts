import handler from "../../../../api/users";

// Preserve the existing Node request/response contract and database implementation.
export const config = { api: { bodyParser: { sizeLimit: "4.5mb" }, responseLimit: false } };
export default handler;
