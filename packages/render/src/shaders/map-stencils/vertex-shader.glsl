#version 300 es

precision highp float;

#include ../helpers.frag;

uniform mat4 u_renderTransform;
uniform float u_animationProgress;

in vec2 a_clipPreviousMaskTrianglePoint;
in vec2 a_clipMaskTrianglePoint;

void main() {
  // Mixing previous and new triangle points
  vec2 clipMaskTrianglePoint = mix(a_clipPreviousMaskTrianglePoint, a_clipMaskTrianglePoint, easing(u_animationProgress));

  // Set triangle points coordinates
  // Variables that start with gl_ are special global variables
  // gl_Position stores the vertex (or 'point') positions (or 'coordinates') in clip coordinates (which go from -1 to 1.)

  gl_Position = u_renderTransform * vec4(clipMaskTrianglePoint, 0.0f, 1.0f);
}
