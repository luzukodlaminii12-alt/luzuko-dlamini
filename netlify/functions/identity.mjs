// Only the site owner can create a login, so nobody else can sign up on the site.
const OWNER_EMAIL = "luzukodlaminii12@gmail.com";

export default {
  userValidate(event) {
    if ((event.user.email || "").trim().toLowerCase() !== OWNER_EMAIL) {
      return event.deny();
    }
  },
};
