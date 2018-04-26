import * as helpers from "./index";
import fs from "fs";
import path from "path";
let ServerHelper = {
  /** @TODO: add save to db.
   * return bool.
   * @param {Object} clientData , json containing program_id and MD5 of the assembly.
   * @param {Object} program, contains info about the specific program.
   */
  serveMD5(clientData, program) {
    if (!clientData.MD5 || clientData.MD5 !== program.md5) {
      program.banned = true;
      return false
    }
    return true
  },
  /** @TODO: add save to db.
  * return 
  * @param {Object} clientData , json containing program_id and MD5 of the assembly.
  * @param {Object} access, contains info about the user's access.
  */
  serveHWID(clientData, access) {
    let filteredHwid = access.hwids.filter(hwid => hwid === clientData.HWID);
    return filteredHwid.length <= 0 ? false : true;
  },
  /** @TODO: add save to db.
  * return bool.
  * @param {Object} clientData , json containing program_id and MD5 of the assembly.
  * @param {Object} program, contains info about the specific program.
  */
  serveVersion(clientData, program) {
    return clientData.VERSION != program.version ? false : true
  },
  /**TODO: implement plugin system. */
  serveHasRemoteData(programID) {
    let remoteVariables = {};
    return new Promise((resolve, reject) => {
      let promises = [];
      fs.readdir("programs/" + programID + "/", (err, files) => {
        if (err) {
          reject(err);
          return;
        }
        files.forEach(file => {
          promises.push(
            new Promise((resolve, reject) => {
              fs.readFile(
                "programs/" + programID + "/" + file,
                (errFile, data) => {
                  if (errFile) {
                    resolve(); //reject(errFile);
                    return;
                  }
                  if (remoteVariables[path.parse(file).name] == null)
                    remoteVariables[path.parse(file).name] = {};
                  if (path.extname(file) == ".json") {
                    remoteVariables[path.parse(file).name][
                      "misc"
                    ] = JSON.stringify(JSON.parse(data));
                  } else {
                    remoteVariables[path.parse(file).name]["data"] = new Buffer(
                      data
                    ).toString("base64");
                  }
                  resolve();
                }
              );
            })
          );
        });
        Promise.all(promises).then(() => {
          return resolve(remoteVariables);
        });
      });
    });
  },
  /**
   * return integer.
   * @param {Date} date, javascript date type. 
   */
  serveDaysLeft(date) {
    let oneDay = 1000 * 60 * 60 * 24;
    let dateNow = new Date();
    let differenceMs = Math.abs(date * 1000 - dateNow.getTime());
    return Math.round(differenceMs / oneDay); // -1 to mock 
  },
  /**
   * return undefined.
   * @param {String} message, message to be logged. 
   */
  log(message) {
    console.log(message);
    fs.appendFile("server.log", message + "\n");
  },
  /**
   * return undefined.
   * @param {Socket} socket, nodejs socket class. 
   * @param {String} status, status to be sent. 
   * @param {String} data , if needed, data to be sent.
   */
  sendPacket(socket, status, data = "") {
    let packet = {
      status: status,
      data: data
    };
    socket.write(JSON.stringify(packet) + "\n");
  }
};
export default ServerHelper;
