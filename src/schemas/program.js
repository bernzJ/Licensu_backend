import { Schema } from "mongoose"
let schema = new Schema({
    //"_id": { type: String, required: true, unique: true },
    name: { type: String, required: true },
    version: { type: String, required: true },
    md5: { type: String, required: true }
});
export default schema;