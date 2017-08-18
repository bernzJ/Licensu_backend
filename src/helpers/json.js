let JSONHelper = {
    isJsonString(str) {
        try {
            JSON.parse(str);
        } catch (e) {
            return false;
        }
        return true;
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
    getValues(ObjectArray) {
        let out = [];
        for (var propName in ObjectArray) {
            if (ObjectArray.hasOwnProperty(propName)) {
                out.push(ObjectArray[propName]);
            }
        }
        return out;
    }
};
export default JSONHelper;