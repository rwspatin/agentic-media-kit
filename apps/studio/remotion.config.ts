import { Config } from "@remotion/cli/config";

// Output goes to ./out (gitignored). JPEG intermediate frames render faster;
// switch to "png" if you need transparency.
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
