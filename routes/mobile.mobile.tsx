import { createFileRoute, redirect } from "@tanstack/react-router";
import { MobileApp } from "./mobile";

export const Route = createFileRoute("/mobile/mobile")({
  beforeLoad: () => {
    throw redirect({ to: "/mobile", replace: true });
  },
  component: MobileApp,
});