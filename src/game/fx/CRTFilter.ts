import { Filter, GlProgram } from 'pixi.js';

const vertex = `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition( void )
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0*uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord( void )
{
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void)
{
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}
`;

const fragment = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;

const float DISTORTION = 0.12;
const float SCANLINE_INTENSITY = 0.04;
const float SCANLINE_COUNT = 270.0;
const float VIGNETTE_STRENGTH = 0.2;

vec2 barrelDistortion(vec2 uv) {
    vec2 c = uv - 0.5;
    float r2 = dot(c, c);
    return c * (1.0 + r2 * DISTORTION + r2 * r2 * DISTORTION * 0.5) + 0.5;
}

void main() {
    vec2 uv = barrelDistortion(vTextureCoord);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        finalColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
    }
    vec4 color = texture(uTexture, uv);

    // Scanlines
    float scanline = sin(uv.y * SCANLINE_COUNT * 3.14159) * 0.5 + 0.5;
    color.rgb -= SCANLINE_INTENSITY * (1.0 - scanline);

    // Vignette
    vec2 vig = uv - 0.5;
    float vigAmount = 1.0 - dot(vig, vig) * VIGNETTE_STRENGTH * 4.0;
    color.rgb *= clamp(vigAmount, 0.0, 1.0);

    finalColor = color;
}
`;

export class CRTFilter extends Filter {
  constructor() {
    const glProgram = GlProgram.from({
      vertex,
      fragment,
    });
    super({ glProgram });
  }
}
