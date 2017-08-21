import tls from 'tls';
import config from './db_config'
import mysql from 'promise-mysql';
import * as helpers from './helpers/index';
import ip from 'ip';

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

        tls.createServer(options, this.onServerCreated)
            .on('connection', this.onSocketConnection)
            .on('secureConnection', this.onSecureSocketConnection)
            .on('tlsClientError', this.onTlsClientError)
            .listen(port, this.createOnListen(port));
    }

    onServerCreated(socket) {
        socket.setEncoding('utf8');
        socket.pipe(socket);
        socket.on('error', this.onError);
        socket.on('close', this.onClose);
        socket.on('data', this.onData);
    }

    onSocketConnection(socket) {
        helpers.ServerHelper.log('Insecure connection from following IP : ' + socket.remoteAddress);
    }

    onSecureSocketConnection(socket) {
        this.socket = socket;
        helpers.ServerHelper.log('Secure connection; client authorized: ', socket.authorized);
    }

    onError(error) {
        // Logging this can be omited.
        helpers.ServerHelper.log(error);
        if (this.socket)
            this.socket.destroy();
        if (this.socket.remoteAddress == null || this.token.data.IPS[0] == null) return;
        let remote = ip.toLong(this.socket.remoteAddress).toString();
        let token = this.token;
        let connection;
        if (token.data.IPS.indexOf(remote) !== -1) {
            token.data.IPS.splice(token.data.IPS.indexOf(remote), 1);
        }
        //token.data.IPS = token.data.IPS.toString();

        /*if (token.data.IPS.indexOf(remote) + remote.length < token.data.IPS.length) {
            token.data.IPS = token.data.IPS.replace('.' + remote, '');
        } else {
            token.data.IPS = token.data.IPS.replace(remote, '');
        }*/
        mysql.createConnection(config).then((conn) => {
            connection = conn;
            helpers.ServerHelper.SaveToken(helpers.ServerHelper.updateToken(token), connection);
        });

    }

    onData(data) {

        // EL PROBLEMUS , this is a call-backable function .. hence destroying the socket wont let it write. wrap this into a promise
        /*let socketPromise = new Promise((resolve, reject) => {
            this.socket.write('195894762', () => {
                resolve();
            });
        }).then(() => {
            this.isbusy = false;
            this.socket.destroy();
        });
        return;*/

        let requireUpdate = false;
        if (this.isbusy) return;

        if (!helpers.JSONHelper.isJsonString(data)) {
            this.socket.destroy();
            return;
        }

        let dataJSON = JSON.parse(data);
        if (!helpers.JSONHelper.isValidToken(dataJSON, { value: ['key', 'value'], count: 1 }) || !helpers.JSONHelper.isValidToken(dataJSON.value, { value: ['MD5', 'VERSION', 'HWID', 'PID'], count: 3 })) {
            this.socket.destroy();
            return;
        }

        let clientToken = dataJSON.key;
        let AskRequest = null;//(dataJSON.value.PID != null && dataJSON.value.PID.length > 4) ? dataJSON.value.PID : null;
        let connection;
        this.isbusy = true;

        mysql.createConnection(config).then((conn) => {
            connection = conn;
            return connection.changeUser({ database: 'licensu' });
        }).then(() => {
            return (!clientToken || clientToken.length < 10) ? false : connection.query('SELECT * FROM tokens INNER JOIN programs ON tokens.id = programs.pid WHERE data = ? OR old_data = ?', [clientToken, clientToken]);
        }).then((rows) => {
            if (rows[0] == null) {
                return helpers.ServerHelper.sendPacket(this.socket, '141', '', false);
            }
            this.token = helpers.JWTHelper.validate(rows[0]);

            if (this.token === true) {
                return helpers.ServerHelper.sendPacket(this.socket, '90', '', false);
            };

            //if (!helpers.JSONHelper.isValidToken(this.token, { value: ['data', 'exp', 'iat'], count: 2 }) || !helpers.JSONHelper.isValidToken(this.token.data, { value: ['plugin', 'daysLeft', 'banned', 'MD5', 'IPBAN', 'IPS', 'HWID'], count: 6 }))
            //    return;

            this.token.row = rows[0];

            if (helpers.JSONHelper.getValues(this.token.data.banned)[0] == true) {
                return helpers.ServerHelper.sendPacket(this.socket, 'F2', '', false);
            }
            return (this.token.row.old_data == null) ? helpers.ServerHelper.serveOldToken({ token: this.token.row.data, shh: this.token.row.shh }, connection) :
                true;
        }).then((result) => {
            if (result === false) {
                return false;
            };

            if (this.token.row == null) {
                return helpers.ServerHelper.sendPacket(this.socket, '194', '', false);
            }

            // Up to date check
            //let appVersion = dataJSON.value.MD5.split(':')[1];

            if (dataJSON.value.VERSION !== this.token.row.version) {
                return helpers.ServerHelper.sendPacket(this.socket, '45', '', false);
            }

            // Md5 match check
            //let md5 = dataJSON.value.MD5.split(':')[0];
            helpers.ServerHelper.log('GOT FOLLOWING MD5: ' + dataJSON.value.MD5);
            //TODO : change that to !==
            if (dataJSON.value.MD5 !== this.token.row.md5) {
                this.token.data.banned = { 'Invalid MD5 checksum. Integrity of the assembly.': true };
                return helpers.ServerHelper.sendPacket(this.socket, 'F2', '', false);
            }
            this.token.data.MD5 = dataJSON.value.MD5;

            // HWID match check

            //new Buffer(this.token.data.IPBAN, 'base64').toString('ascii')
            //{"max_hwid":"5","max_ips":"1"}

            //this.token.data.HWID;
            // ['hwid'] 
            let ipban = JSON.parse(new Buffer(this.token.data.IPBAN, 'base64').toString('ascii'));

            if (ipban.max_hwid !== -1) {
                let serveHWID = helpers.ServerHelper.serveHWID(dataJSON.value.HWID, this.token.data.HWID, ipban);
                if (serveHWID.updateRequired) requireUpdate = true;
                //this.token.data.HWID = serveHWID.newHWID;
                if (!serveHWID.matchPlan) {
                    this.token.data.banned = { 'More HWID than his plan.': true };
                    return helpers.ServerHelper.sendPacket(this.socket, 'F2', '', false);
                }
            }

            // IP plan checkup
            if (ipban.max_ips !== -1) {
                let serveIPS = helpers.ServerHelper.serveIPS(ip.toLong(this.socket.remoteAddress), this.token.data.IPS, ipban);
                if (serveIPS.updateRequired) requireUpdate = true;
                //this.token.data.IPS = serveIPS.newIPS;
                if (!serveIPS.matchPlan) {
                    this.token.data.banned = { 'More IPS than his plan.': true };
                    return helpers.ServerHelper.sendPacket(this.socket, 'F2', '', false);
                }
            }
            // Days left checkup
            let serveDaysLeft = helpers.ServerHelper.serveDaysLeft(this.token);
            this.token.data.daysLeft = serveDaysLeft.newDays;
            if (serveDaysLeft.newDays <= 0) {
                return helpers.ServerHelper.sendPacket(this.socket, '90', '', false);
            }

            // Finally if all checks passed, send plugin list
            return (AskRequest == null) ? connection.query('SELECT * FROM programs').then((rows) => {
                // This is not the final implementation of a 'plugin' system
                return helpers.ServerHelper.serveHasRemoteData(this.token.data.acces).then((Buffer) => {
                    return helpers.ServerHelper.sendPacket(this.socket, 'DEA', Buffer, true);
                }).catch((error) => {
                    // unused
                }).then(() => {
                    if (requireUpdate) {
                        // Update token server & client
                        let newToken = helpers.ServerHelper.updateToken(this.token);
                        return helpers.ServerHelper.SaveToken(newToken, connection).then(() => {
                            // Update the client here
                            return helpers.ServerHelper.sendPacket(this.socket, 'E8', newToken.token, '', false);
                        });
                    }
                });
                //if (connection && connection.end) connection.end();
            }) : true;

        }).then((result) => {
            if (!result) {
                let newToken = helpers.ServerHelper.updateToken(this.token);
                return helpers.ServerHelper.SaveToken(newToken, connection);
            }
        }).then(() => {
            if (connection && connection.end) connection.end(); if (this.socket) this.socket.destroy();
            this.isbusy = false;
        }).catch((error) => {
            this.isbusy = false;
            if (this.socket) {
                this.socket.destroy();
            }
            helpers.ServerHelper.log(error);
        }).catch((error) => {
            if (connection && connection.end) connection.end();
            helpers.ServerHelper.log(error);
        });

    }

    // Todo put these in function to remove redundancy.
    onClose() {
        if (this.socket)
            this.socket.destroy();
        if (this.socket.remoteAddress == null || this.token.data.IPS[0] == null) return;
        let remote = ip.toLong(this.socket.remoteAddress).toString();
        let token = this.token;
        let connection;
        if (token.data.IPS.indexOf(remote) !== -1) {
            token.data.IPS.splice(token.data.IPS.indexOf(remote), 1);
        }
        //token.data.IPS = token.data.IPS.toString();

        /*if (token.data.IPS.indexOf(remote) + remote.length < token.data.IPS.length) {
            token.data.IPS = token.data.IPS.replace('.' + remote, '');
        } else {
            token.data.IPS = token.data.IPS.replace(remote, '');
        }*/
        mysql.createConnection(config).then((conn) => {
            connection = conn;
            helpers.ServerHelper.SaveToken(helpers.ServerHelper.updateToken(token), connection);
        });
    }

    onTlsClientError(error) {
        helpers.ServerHelper.log(error);
    }

    createOnListen(port) {
        return (() => {
            helpers.ServerHelper.log(`Listening on port ${port}`);
        }).bind(this);
    }
};