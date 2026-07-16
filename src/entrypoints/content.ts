import { defineContentScript } from "#imports";
import { initContentScript } from "@/content-script";

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_start",
  allFrames: true,
  main() {
    initContentScript();
  },
});
