import { Schema } from "mongoose"
let schema = new Schema({
  //_id: { type: Schema.Types.ObjectId, required: true},
  access: [
    {
      program_id: { type: String, required: true },
      days: { type: Date, required: true },
      hwid_plan: { type: String, required: true },
      ran: { type: Boolean, required: true },
      status: {
        banned: { type: Boolean, required: true},
        reason: { type: String, required: false}
      },
      hwids: { type: [String], required: false }
    }
  ],
});
export default schema;