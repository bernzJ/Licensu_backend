import jwt from 'jsonwebtoken';

let JWTHelper = {
    validate(result) {
        try {
            var decoded = jwt.verify(result.data, result.shh);
            return decoded;
        } catch (error) {
            return true;
        }
    },
    sign(token, shh, expireIn) {
        let updatedToken = jwt.sign(token, shh, expireIn);
        return updatedToken;
    }
};
export default JWTHelper;