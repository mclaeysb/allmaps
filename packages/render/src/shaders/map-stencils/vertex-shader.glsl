#version 300 es

precision highp float;

#include ../helpers.frag;

uniform mat4 u_renderTransform;
uniform float u_animationProgress;

in vec2 a_clipPreviousEarcutTrianglePoint;
in vec2 a_clipEarcutTrianglePoint;

void main() {
  // Mixing previous and new triangle points
  vec2 clipEarcutTrianglePoint = mix(a_clipPreviousEarcutTrianglePoint, a_clipEarcutTrianglePoint, easing(u_animationProgress));

  // Set triangle points coordinates
  // Variables that start with gl_ are special global variables
  // gl_Position stores the vertex (or 'point') positions (or 'coordinates') in clip coordinates (which go from -1 to 1.)

  gl_Position = u_renderTransform * vec4(clipEarcutTrianglePoint, 0.0f, 1.0f);
}
