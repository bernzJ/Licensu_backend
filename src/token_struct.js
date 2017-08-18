let token = {
    access: {}, // Object: object object contains which programs user can access as key, values would be an object with the days/hwid/ipplan user owns.
    application: {}, // Object: fetch from db the application, MD5,DAYSPLANS,IPPLANS
    client: {}, // Object: sent from the client. Contain current hwid, fetching app etc.
};

let serverToClientPacket = {
    status: 45, //0x value
    data: "", //bs64 data if any , currently unused

}