// Distortion
if(u_distortion) {
  // color = colorWhite; // TODO: Add option to not display image
  // color = colorTransparant; // TODO: Add option to not display image

  float trianglePointDistortion = v_trianglePointDistortion;

  // TODO: Add component to toggle stepwise vs continuous
  trianglePointDistortion = floor(trianglePointDistortion * 10.0f) / 10.0f;

  switch(u_distortionOptionsdistortionMeasure) {
    case 0:
      if(trianglePointDistortion > 0.0f) {
        color = spectral_mix(color, u_colorDistortion00, trianglePointDistortion);
      } else {
        color = spectral_mix(color, u_colorDistortion01, abs(trianglePointDistortion));
      }
      break;
    case 1:
      color = spectral_mix(color, u_colorDistortion1, trianglePointDistortion);
      break;
    case 2:
      color = spectral_mix(color, u_colorDistortion2, trianglePointDistortion);
      break;
    case 3:
      color = trianglePointDistortion == -1.0f ? u_colorDistortion3 : color;
      break;
    default:
      color = color;
  }
}

// Grid
if(u_grid) {
  float gridSize = 20.0f * float(u_currentBestScaleFactor);
  float gridWidth = 2.0f * float(u_currentBestScaleFactor);
  if(mod(float(resourceTrianglePointX) + gridWidth / 2.0f, gridSize) < gridWidth || mod(float(resourceTrianglePointY) + gridWidth / 2.0f, gridSize) < gridWidth) {
    color = u_colorGrid;
  }
}