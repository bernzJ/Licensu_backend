let JSONHelper = {
    isJsonString(str) {
        try {
            if (typeof (str) === "object") return str
            return JSON.parse(str);
        } catch (e) {
            return false;
        }
    },
    isValidToken(token, props) {
        let propCount = -1;
        Object.keys(token).forEach(function (key, index) {
            if (Object.prototype.hasOwnProperty.call(token, key)) {
                propCount++;
                //console.log(props.value.indexOf(key));
                if (props.value.indexOf(key) == -1) {
                    //console.log('NOT OWNED:' + key);
                    return false;
                }
            }
        });
        //console.log('props count: ' +propCount);
        //console.log('props count expected: ' + props.count);
        if (propCount !== props.count) {
            //console.log('props count missmatch');
            return false;
        }
        return true;
    },
    /**
     * return [field] value or false
     * @param {Array} ObjectArray, contains the data. 
     * @param {Object} condition, what to reduce with. 
     * @param {String} field, which field to return.
     * @param {Any} if setValue is not false, the field will be set to that value.
     */
    getValue(ObjectArray, condition, field, setValue = false) {
        let filtered = ObjectArray.filter(obj => obj.hasOwnProperty(condition.Key) && obj.hasOwnProperty(field) && obj[condition.Key] == condition.Value);
        return filtered.length > 0 ? setValue != false ? setValue == "return" ? filtered[0] : filtered[0][field] == setValue : filtered[0][field] : false;
    }
};
export default JSONHelper;