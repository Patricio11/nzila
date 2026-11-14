import { t } from "@nzila/i18n";
import "./shell.css";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("#app missing");

const title = document.createElement("h1");
title.textContent = t("app.name");
const tagline = document.createElement("p");
tagline.textContent = t("frontdoor.tagline");
const status = document.createElement("p");
status.textContent = t("frontdoor.building");
app.append(title, tagline, status);
