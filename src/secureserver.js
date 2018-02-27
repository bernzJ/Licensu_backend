import tls from "tls";
import config from "./db_config";
import mysql from "promise-mysql";
import * as helpers from "./helpers/index";
import ip from "ip";

// Our main class object
export default class SecureServer {
  constructor(port, ipAddress, options) {
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
    this.clients = {};

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
    if (this.socket && this.socket.remoteAddress != null) {
      helpers.ServerHelper.removeIP(
        this.clients,
        ip.toLong(this.socket.remoteAddress)
      );
      this.socket.destroy();
    }
  }

  onData(data) {
    let requireUpdate = false;
    if (this.isbusy) return;

    if (!helpers.JSONHelper.isJsonString(data)) {
      this.socket.destroy();
      return;
    }

    let dataJSON = JSON.parse(data);
    if (
      !helpers.JSONHelper.isValidToken(dataJSON, {
        value: ["uid", "value"],
        count: 1
      }) ||
      !helpers.JSONHelper.isValidToken(dataJSON.value, {
        value: ["MD5", "VERSION", "HWID", "PID"],
        count: 3
      })
    ) {
      this.socket.destroy();
      return;
    }

    let base64regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
    if (!base64regex.test(dataJSON.uid)) {
      this.socket.destroy();
      return;
    }
    //let clientToken = dataJSON.key;
    let _uid = new Buffer(dataJSON.uid, "base64").toString("ascii");
    console.log(_uid);
    let connection;
    this.isbusy = true;
    if (!this.clients[_uid]) this.clients[_uid] = [];
    this.clients[_uid].push(ip.toLong(this.socket.remoteAddress));
    let currentClient = this.clients[_uid];

    mysql
      .createConnection(config)
      .then(conn => {
        connection = conn;
        return connection.changeUser({ database: "licensu" });
      })
      .then(() => {
        //SELECT * FROM tokens INNER JOIN programs ON tokens.id = programs.pid WHERE data = ? OR old_data = ?
        return connection.query(
          "SELECT * FROM tokens INNER JOIN programs ON tokens.id = programs.pid WHERE uid = ?",
          [_uid]
        );
      })
      .then(rows => {
        if (rows[0] == null) {
          return helpers.ServerHelper.sendPacket(this.socket, "141", "", false);
        }
        this.token = helpers.JWTHelper.validate(rows[0]);

        if (this.token === true) {
          return helpers.ServerHelper.sendPacket(this.socket, "90", "", false);
        }

        //if (!helpers.JSONHelper.isValidToken(this.token, { value: ['data', 'exp', 'iat'], count: 2 }) || !helpers.JSONHelper.isValidToken(this.token.data, { value: ['plugin', 'daysLeft', 'banned', 'MD5', 'IPBAN', 'IPS', 'HWID'], count: 6 }))
        //    return;

        this.token.row = rows[0];
        //this.token.uid = _uid;

        if (helpers.JSONHelper.getValues(this.token.data.banned)[0] == true) {
          return helpers.ServerHelper.sendPacket(this.socket, "F2", "", false);
        }

        return true;
      })
      .then(result => {
        if (result === false) {
          return false;
        }

        if (this.token.row == null) {
          return helpers.ServerHelper.sendPacket(this.socket, "194", "", false);
        }

        if (dataJSON.value.VERSION !== this.token.row.version) {
          return helpers.ServerHelper.sendPacket(this.socket, "45", "", false);
        }

        // Md5 match check
        if (dataJSON.value.MD5 !== this.token.row.md5) {
          this.token.data.MD5 = {
            md5: escape(dataJSON.value.MD5),
            app_version: escape(dataJSON.value.VERSION)
          };
          this.token.data.banned = {
            "Invalid MD5 checksum. Integrity of the assembly.": true
          };
          requireUpdate = true;
          return helpers.ServerHelper.sendPacket(this.socket, "F2", "", false);
        }

        let ipban = JSON.parse(
          new Buffer(this.token.data.IPBAN, "base64").toString("ascii")
        );

        if (ipban.max_hwid !== -1) {
          let serveHWID = helpers.ServerHelper.serveHWID(
            dataJSON.value.HWID,
            this.token.data.HWID,
            ipban
          );
          if (serveHWID.updateRequired) requireUpdate = true;
          //this.token.data.HWID = serveHWID.newHWID;
          if (!serveHWID.matchPlan) {
            this.token.data.banned = { "More HWID than his plan.": true };
            return helpers.ServerHelper.sendPacket(
              this.socket,
              "F2",
              "",
              false
            );
          }
        }
        // IP plan checkup
        if (ipban.max_ips !== -1) {
          let serveIPS = helpers.ServerHelper.serveIPS(currentClient, ipban);
          if (serveIPS.updateRequired) requireUpdate = true;
          //this.token.data.IPS = serveIPS.newIPS;
          if (!serveIPS.matchPlan) {
            this.token.data.banned = { "More IPS than his plan.": true };
            return helpers.ServerHelper.sendPacket(
              this.socket,
              "F2",
              "",
              false
            );
          }
        }
        // Days left checkup
        let serveDaysLeft = helpers.ServerHelper.serveDaysLeft(this.token);
        this.token.data.daysLeft = serveDaysLeft.newDays;
        if (serveDaysLeft.requireUpdate) requireUpdate = true;
        if (serveDaysLeft.newDays <= 0) {
          return helpers.ServerHelper.sendPacket(this.socket, "90", "", false);
        }

        // This is not the final implementation of a 'plugin' system
        return helpers.ServerHelper
          .serveHasRemoteData(this.token.data.access)
          .then(Buffer => {
            if (Object.keys(Buffer).length === 0) return false;
            return helpers.ServerHelper.sendPacket(
              this.socket,
              "DEA",
              Buffer,
              true
            );
          });
        //if (connection && connection.end) connection.end();
      })
      .then(() => {
        console.log("Does it require update ? :" + requireUpdate);
        if (requireUpdate) {
          // Update token server & client
          let newToken = helpers.ServerHelper.updateToken(this.token);
          return helpers.ServerHelper.SaveToken(newToken, connection);
        } else {
          return false;
        }
      })
      .then(() => {
        console.log("Should be sending EOF here");
        helpers.ServerHelper
          .sendPacket(this.socket, "DEAD", "", true)
          .then(() => {
            if (connection && connection.end) connection.end();
            if (this.socket) this.socket.destroy();
            this.isbusy = false;
          });
      })
      .catch(error => {
        console.log("Something went wrong");
        console.log(error);
        this.isbusy = false;
        if (this.socket) {
          this.socket.destroy();
        }
        if (connection && connection.end) connection.end();
        helpers.ServerHelper.log(error);
      });
  }

  onClose() {
    if (this.socket && this.socket.remoteAddress != null) {
      helpers.ServerHelper.removeIP(
        this.clients,
        ip.toLong(this.socket.remoteAddress)
      );
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
