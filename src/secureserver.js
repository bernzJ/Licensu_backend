import tls from "tls";
import db_config from "./db_config";
import mongoose from "mongoose";
import * as helpers from "./helpers/index";
import { format } from "util"
import uniqueValidator from "mongoose-unique-validator"
import tokenSchema from "./schemas/token"
import programSchema from "./schemas/program"
import fs from "fs"
// Our main class object
export default class SecureServer {
  constructor(port, ipAddress, options) {
    // Mock
    return this.onData({ "token": "5acdb08775c5d653681d5e59" });

    this.onServerCreated = this.onServerCreated.bind(this);
    this.onSocketConnection = this.onSocketConnection.bind(this);
    this.onSecureSocketConnection = this.onSecureSocketConnection.bind(this);
    this.onTlsClientError = this.onTlsClientError.bind(this);
    this.createOnListen = this.createOnListen.bind(this);
    this.onError = this.onError.bind(this);
    this.onData = this.onData.bind(this);
    this.onClose = this.onClose.bind(this);
    // Global variables
    this.token = null;
    this.socket = null;
    this.isbusy = false;

    tls
      .createServer(options, this.onServerCreated)
      .on("connection", this.onSocketConnection)
      .on("secureConnection", this.onSecureSocketConnection)
      .on("tlsClientError", this.onTlsClientError)
      .listen(port, this.createOnListen(port));
  }

  onServerCreated(socket) {
    socket.setEncoding("utf8");
    socket.pipe(socket);
    socket.on("error", this.onError);
    socket.on("close", this.onClose);
    socket.on("data", this.onData);
  }

  onSocketConnection(socket) {
    helpers.ServerHelper.log(
      "Insecure connection from following IP : " + socket.remoteAddress
    );
    if (this.socket) {
      this.socket.destroy();
    }
  }

  onSecureSocketConnection(socket) {
    this.socket = socket;
    helpers.ServerHelper.log(
      "Secure connection; client authorized: ",
      socket.authorized
    );
  }

  onError(error) {
    // Logging this can be omited.
    helpers.ServerHelper.log(error);
    if (this.socket) {
      this.socket.destroy();
    }
  }

  onData(data) {

    if (this.isbusy) return;

    let dataJson = helpers.JSONHelper.isJsonString(data);
    console.log(dataJson)
    this.isbusy = true;

    //console.log(format("mongodb://%s:%s@%s?authMechanism=DEFAULT&authSource=%s", db_config.username, db_config.password, db_config.host, db_config.authSource));

    mongoose.connect("mongodb://127.0.0.1/licensu").then(
      () => {
        let query = mongoose.model("tokens", tokenSchema, "tokens");
        query.findById(dataJson.token, function (err, token) {
          if (err) return helpers.ServerHelper.sendPacket(this.socket, { status: "141" });
          if (token) {
            let userAccess = helpers.JSONHelper.getValue(token, { Key: "program_id", Value: dataJson.data.PID }, "program_id", "return");
            if (!userAccess) return helpers.ServerHelper.sendPacket(this.socket, { status: "BEEF" });

            let queryProgram = mongoose.model("programs", programSchema, "programs");
            queryProgram.findById(userAccess.program_id, function (err, program) {

              if (err) return helpers.ServerHelper.sendPacket(this.socket, { status: "141" });
              if (!helpers.ServerHelper.serveMD5(dataJson.data, queryProgram)) return helpers.ServerHelper.sendPacket(this.socket, { status: "F2" });
              if (helpers.ServerHelper.serveDaysLeft(program.days) <= 0) return helpers.ServerHelper.sendPacket(this.socket, { status: "90" });
              if (!helpers.ServerHelper.serveHWID(dataJson.data, userAccess)) return helpers.ServerHelper.sendPacket(this.socket, { status: "F2" });
              if (!helpers.ServerHelper.serveVersion(dataJson.data, queryProgram)) {
                helpers.ServerHelper.sendPacket(this.socket, { status: "45" });
                fs.readFile(`./updates/${queryProgram.version}.bin`, (errFile, data) => {
                  if (errFile) return helpers.ServerHelper.sendPacket(this.socket, { status: "C2" });
                  return helpers.ServerHelper.sendPacket(this.socket, { status: "C2", updateBuffer: data });
                });
              }
              // Todo: implement plugins stuff.
            });
          }
        });

      },
      err => {
        throw err
      }
    );
  }

  onClose() {
    if (this.socket) {
      this.socket.destroy();
    }
  }

  onTlsClientError(error) {
    helpers.ServerHelper.log(error);
  }

  createOnListen(port) {
    return (() => {
      helpers.ServerHelper.log(`Listening on port ${port}`);
    }).bind(this);
  }
}
