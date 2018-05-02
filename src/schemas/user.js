import { Schema } from "mongoose"
let schema = new Schema({
  email: { type: String, required: true },
  password: { type: String, required: true }
});
export default schema;