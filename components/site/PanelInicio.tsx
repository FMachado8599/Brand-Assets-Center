"use client";

import dynamic from "next/dynamic";

/**
 * El panel del Inicio con sesión, en su propio pedazo de código: quien llega a la presentación (sin
 * sesión) no lo baja. Lo elige app/page.tsx.
 */
export const PanelInicio = dynamic(() => import("./Dashboard").then((m) => m.Dashboard));
