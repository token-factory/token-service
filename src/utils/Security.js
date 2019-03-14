const crypto = require('crypto');


module.exports = class Security {

 
    async encrypt(stringToEncrypt, password, salt) {

        let derivedKey = crypto.pbkdf2Sync(password, salt, 10000, 32, "sha256");

        // encrypt the Text
        let cipher = crypto.createCipheriv("aes-256-gcm", derivedKey, '00000000000000000000000000000000');
        let encrypted = cipher.update(stringToEncrypt, "utf8", "base64");
        encrypted += cipher.final("base64");
        return encrypted;
    }

    async decrypt(encryptedString, password, salt){
        let derivedKey = crypto.pbkdf2Sync(password, salt, 10000, 32, "sha256");

        // decrypt the Text
        let decipher = crypto.createDecipheriv("aes-256-gcm", derivedKey, '00000000000000000000000000000000');
        let decrypted = decipher.update(encryptedString, "base64", "utf8");
        return decrypted;
    }
}

// const Security = module.exports;
// const security =  new Security();

// test = async function(){
//     let salt = crypto.randomBytes(128);
//     const encrypted = await security.encrypt ("toddkaplinger", "password", "1234");
//     console.log('encrypted', encrypted)

//     const decrypted =  await security.decrypt (encrypted, "password", "1234");
//     console.log('decrypted', decrypted)
//     console.log("toddkaplinger".localeCompare(decrypted) === 0 ? "yes" : "no");
// }

// test();