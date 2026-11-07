
function isValidPhoneNumber(value) {
    const tanzaniaRegex = /^255[67][0-9]{8}$/;
    const internationalRegex = /^[1-9][0-9]{7,14}$/;
  
    return tanzaniaRegex.test(value) || internationalRegex.test(value);
  }
  
export { isValidPhoneNumber };

