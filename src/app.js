import SecureServer from './secureserver';
import config from './server_config';


//var t = new testing({dick: true});
let sslServer = new SecureServer(8000, '0.0.0.0', config);


/*
.then(function(retVal){
    console.log(retVal);
});
 */