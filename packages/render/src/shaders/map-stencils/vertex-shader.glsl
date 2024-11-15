#version 300 es

precision highp float;

in vec2 a_clipMaskTrianglePoint;

void main() {
  gl_Position = vec4(a_clipMaskTrianglePoint, 0.0f, 1.0f);
}
