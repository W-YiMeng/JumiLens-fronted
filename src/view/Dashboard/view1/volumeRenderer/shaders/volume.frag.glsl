precision highp float;
precision highp sampler3D;

uniform sampler3D uVolume;
uniform sampler2D uTransferFunction;
uniform vec3 uCameraPos;
uniform mat4 uInvViewMatrix;
uniform mat4 uInvProjMatrix;
uniform vec2 uResolution;
uniform vec3 uBoxMin;
uniform vec3 uBoxMax;
uniform float uStepSize;
uniform float uDensityScale;
uniform vec3 uLightDir;
uniform float uLightIntensity;
uniform int uPreviewMode;
uniform vec2 uPreviewRange;
uniform vec3 uPreviewColor;
uniform sampler3D uVolumeB;
uniform vec3 uPreviewColorPos;
uniform vec3 uPreviewColorNeg;
uniform float uPreviewDiffScale;
uniform int uPreviewOverlay;

varying vec2 vUv;

struct Ray {
    vec3 origin;
    vec3 dir;
};

bool intersectBox(Ray ray, vec3 boxMin, vec3 boxMax, out float tNear, out float tFar) {
    vec3 invDir = 1.0 / ray.dir;
    vec3 t1 = (boxMin - ray.origin) * invDir;
    vec3 t2 = (boxMax - ray.origin) * invDir;
    vec3 tMin = min(t1, t2);
    vec3 tMax = max(t1, t2);
    tNear = max(max(tMin.x, tMin.y), tMin.z);
    tFar = min(min(tMax.x, tMax.y), tMax.z);
    return tNear <= tFar && tFar > 0.0;
}

vec4 transferFunction(float density) {
    return texture2D(uTransferFunction, vec2(density, 0.5));
}

vec3 calcGradient(vec3 texCoord) {
    float step = 1.0 / 128.0;
    float vL = texture(uVolume, texCoord - vec3(step, 0.0, 0.0)).r;
    float vR = texture(uVolume, texCoord + vec3(step, 0.0, 0.0)).r;
    float vD = texture(uVolume, texCoord - vec3(0.0, step, 0.0)).r;
    float vU = texture(uVolume, texCoord + vec3(0.0, step, 0.0)).r;
    float vB = texture(uVolume, texCoord - vec3(0.0, 0.0, step)).r;
    float vF = texture(uVolume, texCoord + vec3(0.0, 0.0, step)).r;
    vec3 g = vec3(vR - vL, vU - vD, vF - vB);
    float len = length(g);
    return len < 1e-4 ? vec3(0.0) : -g / len;
}

vec3 phongShade(vec3 color, vec3 normal, vec3 lightDir, vec3 viewDir, float intensity) {
    vec3 halfDir = normalize(lightDir + viewDir);
    float diff = max(dot(normal, lightDir), 0.0);
    float spec = pow(max(dot(normal, halfDir), 0.0), 32.0);
    float ambient = 0.12;
    float diffuse = 0.75;
    float specular = 0.45;
    float li = clamp(intensity, 0.0, 3.0);
    return color * (ambient + li * diffuse * diff) + vec3(1.0) * li * specular * spec;
}

void main() {
    // Reconstruct world-space ray
    vec2 ndc = vUv * 2.0 - 1.0;
    vec4 clipNear = vec4(ndc, -1.0, 1.0);
    vec4 eyeNear = uInvProjMatrix * clipNear;
    eyeNear /= eyeNear.w;
    vec3 viewDir = normalize(eyeNear.xyz);
    vec3 worldDir = normalize((uInvViewMatrix * vec4(viewDir, 0.0)).xyz);

    Ray ray;
    ray.origin = uCameraPos;
    ray.dir = worldDir;

    float tNear, tFar;
    if (!intersectBox(ray, uBoxMin, uBoxMax, tNear, tFar)) {
        discard;
    }
    tNear = max(tNear, 0.0);

    vec3 boxSize = uBoxMax - uBoxMin;
    vec3 lightDir = normalize(uLightDir);
    int maxSteps = int(ceil((tFar - tNear) / uStepSize));
    maxSteps = min(maxSteps, 512);

    vec4 accum = vec4(0.0);
    float t = tNear;

    for (int i = 0; i < 512; i++) {
        if (i >= maxSteps) break;
        if (accum.a > 0.99) break;

        vec3 pos = ray.origin + t * ray.dir;
        vec3 texCoord = (pos - uBoxMin) / boxSize;
        texCoord = clamp(texCoord, 0.0, 1.0);

        float density = clamp(texture(uVolume, texCoord).r * uDensityScale, 0.0, 1.0);

        if (density > 0.005) {
            vec4 tfColor = transferFunction(density);

            if (uPreviewMode == 2) {
                float densityB = texture(uVolumeB, texCoord).r;
                float maxD = max(density, densityB);
                float edge = 0.02;
                float inRange = smoothstep(uPreviewRange.x, uPreviewRange.x + edge, maxD)
                              * (1.0 - smoothstep(uPreviewRange.y, uPreviewRange.y + edge, maxD));
                float diff = (density - densityB) * uPreviewDiffScale;
                float mag = clamp(abs(diff), 0.0, 1.0);
                vec3 diffColor = diff >= 0.0 ? uPreviewColorPos : uPreviewColorNeg;
                vec3 baseColor = vec3(maxD * 0.8 + 0.15);
                vec3 overlay = diffColor * (0.35 + 0.65 * mag);
                vec3 mixed = uPreviewOverlay == 1 ? mix(baseColor, overlay, 0.85) : overlay;
                float alpha = (uPreviewOverlay == 1) ? max(0.35, mag) : mag;
                tfColor = vec4(mixed, alpha * inRange);
            } else if (uPreviewMode == 1) {
                float edge = 0.02;
                float inRange = smoothstep(uPreviewRange.x, uPreviewRange.x + edge, density)
                              * (1.0 - smoothstep(uPreviewRange.y, uPreviewRange.y + edge, density));
                tfColor = vec4(uPreviewColor * (0.2 + 0.8 * inRange), inRange);
            } else {
                tfColor.a = clamp(tfColor.a * uDensityScale, 0.0, 1.0);
            }

            if (tfColor.a > 0.005) {
                vec3 normal = calcGradient(texCoord);
                if (length(normal) > 1e-4) {
                    vec3 vDir = normalize(uCameraPos - pos);
                    tfColor.rgb = phongShade(tfColor.rgb, normal, lightDir, vDir, uLightIntensity);
                }
                float ma = 1.0 - accum.a;
                accum.rgb += ma * tfColor.a * tfColor.rgb;
                accum.a += ma * tfColor.a;
            }
        }
        t += uStepSize;
    }

    vec3 bgColor = vec3(1.0, 1.0, 1.0);
    accum.rgb += (1.0 - accum.a) * bgColor;
    gl_FragColor = vec4(accum.rgb, 1.0);
}
