import { defineUnlistedScript } from "#imports";
import { initPageProvider } from "@/content-script/pageProvider";

export default defineUnlistedScript(() => {
  initPageProvider();
});
