import * as helpers from './index';
import fs from 'fs';
import path from 'path';

let ServerHelper = {
    updateToken(newTokenObject) {
        let row = newTokenObject.row;
        delete newTokenObject.exp;
        delete newTokenObject.iat;
        delete newTokenObject.row;
        let updatedToken = helpers.JWTHelper.sign(newTokenObject, row.shh, {
            expiresIn: newTokenObject.data.daysLeft + ' days'
        });
        newTokenObject.row = row;
        return { token: updatedToken, shh: row.shh };
    },
    // This token object contains the token string and the SH
    SaveToken(newTokenObject, connection) {
        return connection.query('UPDATE tokens SET ? WHERE ?', [{
            data: newTokenObject.token
        }, {
            shh: newTokenObject.shh
        }]);
    },
    // This token object contains the token string and the SH
    serveOldToken(newTokenObject, connection) {
        return connection.query('UPDATE tokens SET ? WHERE ?', [{
            old_data: newTokenObject.token
        }, {
            shh: newTokenObject.shh
        }]);
    },
    // Todo eventually, fix redundancy.
    serveHWID(client, server, plan) {
        if (server == null || !Array.isArray(server)) server = [];
        let outData = {
            newHWID: '',
            matchPlan: false,
            updateRequired: false
        };
        let matchPlan = (newHWID) => {
            //if (plan.split(':')[0] === '-1') return true;
            let countHWID = newHWID.length;
            if (countHWID > plan.max_hwid) return false;
            return true;
        };

        if (server.indexOf(client) == -1) {
            server.push(client);
            //outData.newHWID = server;
            //outData.newHWID = server + '.' + client;
            outData.updateRequired = true;

        }
        outData.matchPlan = matchPlan(server);

        return outData;
    },
    serveIPS(client, server, plan) {
        if (server == null || !Array.isArray(server)) server = [];
        let outData = {
            newIPS: '',
            matchPlan: false,
            updateRequired: false
        };
        let matchPlan = (newIPS) => {

            let countIPS = newIPS.length;
            if (countIPS > plan.max_ips) return false;
            return true;
        };


        if (server.indexOf(client) !== -1) {
            server.push(client);
            outData.updateRequired = true;
        }
        outData.matchPlan = matchPlan(server);

        return outData;
    },
    serveHasRemoteData(programID) {
        let remoteVariables = {};
        return new Promise((resolve, reject) => {
            let promises = [];
            fs.readdir('programs/' + programID + '/', (err, files) => {
                if (err) { reject(err); return; }
                files.forEach(file => {
                    promises.push(new Promise((resolve, reject) => {
                        console.log(file);
                        fs.readFile('programs/' + programID + '/' + file, (errFile, data) => {
                            if (errFile) { reject(errFile); return; }
                            remoteVariables[path.parse(file).name] = new Buffer(data).toString('base64');
                            resolve();
                        });
                    }));
                });
                Promise.all(promises).then(() => {
                    return resolve(remoteVariables);
                });
            });
        });
    },
    serveDaysLeft(token) {
        let oneDay = 1000 * 60 * 60 * 24;
        let dateNow = new Date();
        let differenceMs = Math.abs((token.exp * 1000) - dateNow.getTime());
        let daysLeft = Math.round(differenceMs / oneDay); // - 1 THE -1 IS TO TEST SOMESHIT
        let outData = {
            newDays: token.data.daysLeft
        }
        if (token.data.daysLeft !== daysLeft) {
            outData.newDays = daysLeft;
            outData.updateRequired = true;
        }
        return outData;
    },
    readFiles(files) {

    },
    log(message) {
        console.log(message);
        fs.appendFile('server.log', message + '\n');
    },
    sendPacket(socket, status, data, retbool) {
        let packet = {
            status: status,
            data: (typeof data === 'undefined') ? '' : data,
        };
        return new Promise((resolve, reject) => {
            socket.write(JSON.stringify(packet) + '\n', () => { resolve(retbool) });
        });
    }
}
export default ServerHelper;