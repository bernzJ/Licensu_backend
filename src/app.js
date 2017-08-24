import SecureServer from './secureserver';
import config from './server_config';



let sslServer = new SecureServer(8000, '0.0.0.0', config);


/*
.then(function(retVal){
    console.log(retVal);
});
 */