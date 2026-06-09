precision highp float;
precision highp sampler3D;

uniform sampler3D uVolume;
uniform sampler3D uDiffVolume;
uniform sampler2D uTransferFunction;
uniform vec3 uCameraPos;
uniform mat4 uInvViewMatrix;
uniform mat4 uInvProjMatrix;
uniform vec2 uResolution;
uniform vec3 uBoxMin;
uniform vec3 uBoxMax;
uniform float uStepSize;
uniform float uStepRef;
uniform float uGradLow;
uniform float uGradHigh;
uniform float uGradWeight;
uniform bool uHasDiff;
uniform float uDiffOpacity;
uniform float uDiffBaseOpacity;
uniform bool uShowOriginal;
uniform bool uShowDifference;

varying vec2 vUv;

struct Ray {
    vec3 origin;
    vec3 dir;
};

float hash(vec2 p) {
    float h = dot(p, vec2(127.1, 311.7));
    return fract(sin(h) * 43758.5453);
}

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

vec3 calcGradient(vec3 texCoord, out float mag) {
    float step = 1.0 / 128.0;
    float vL = texture(uVolume, texCoord - vec3(step, 0.0, 0.0)).r;
    float vR = texture(uVolume, texCoord + vec3(step, 0.0, 0.0)).r;
    float vD = texture(uVolume, texCoord - vec3(0.0, step, 0.0)).r;
    float vU = texture(uVolume, texCoord + vec3(0.0, step, 0.0)).r;
    float vB = texture(uVolume, texCoord - vec3(0.0, 0.0, step)).r;
    float vF = texture(uVolume, texCoord + vec3(0.0, 0.0, step)).r;
    vec3 g = vec3(vR - vL, vU - vD, vF - vB);
    mag = length(g);
    return mag < 1e-4 ? vec3(0.0) : -g / mag;
}

vec3 phongShade(vec3 color, vec3 normal, vec3 lightDir, vec3 viewDir) {
    vec3 halfDir = normalize(lightDir + viewDir);
    float diff = max(dot(normal, lightDir), 0.0);
    float spec = pow(max(dot(normal, halfDir), 0.0), 32.0);
    float ambient = 0.08;
    float diffuse = 0.6;
    float specular = 0.32;
    return color * (ambient + diffuse * diff) + vec3(1.0) * specular * spec;
}

void main() {
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
    vec3 lightDir = normalize(vec3(1.0, 1.0, -0.5));
    int maxSteps = int(ceil((tFar - tNear) / uStepSize));
    maxSteps = min(maxSteps, 512);

    float jitter = hash(gl_FragCoord.xy) * uStepSize;
    float t = tNear + jitter;

    vec4 accum = vec4(0.0);
    float stepRatio = uStepSize / uStepRef;

    for (int i = 0; i < 512; i++) {
        if (i >= maxSteps) break;
        if (accum.a > 0.99) break;

        vec3 pos = ray.origin + t * ray.dir;
        vec3 texCoord = (pos - uBoxMin) / boxSize;
        texCoord = clamp(texCoord, 0.0, 1.0);

        float density = texture(uVolume, texCoord).r;
        float diffVal = 0.0;
        if (uHasDiff) {
            diffVal = texture(uDiffVolume, texCoord).r;
        }

        if (density > 0.005 || abs(diffVal) > 0.01) {
            vec4 tfColor = transferFunction(density);

            // In diff mode, ignore TF opacity — use subdued density-driven alpha
            // so the diff overlay (red/blue) stands out clearly.
            float alpha;
            if (uHasDiff) {
                alpha = density * uDiffBaseOpacity;
            } else {
                alpha = tfColor.a;
            }
            if (alpha > 0.005 || abs(diffVal) > 0.01) {
                float gradMag;
                vec3 normal = calcGradient(texCoord, gradMag);

                float alphaCorrected = 1.0 - pow(1.0 - alpha, stepRatio);
                if (uGradWeight > 0.0 && gradMag > 1e-4) {
                    float gradFactor = smoothstep(uGradLow, uGradHigh, gradMag);
                    alphaCorrected = mix(alphaCorrected, alphaCorrected * gradFactor, uGradWeight);
                }

                if (uShowOriginal && length(normal) > 1e-4) {
                    vec3 vDir = normalize(uCameraPos - pos);
                    tfColor.rgb = phongShade(tfColor.rgb, normal, lightDir, vDir);
                }

                if (uHasDiff && uShowDifference && abs(diffVal) > 0.01) {
                    vec3 diffColor = diffVal > 0.0
                        ? vec3(0.95, 0.08, 0.08)
                        : vec3(0.08, 0.15, 0.95);
                    float intensity = clamp(abs(diffVal) * 0.6, 0.0, 1.0) * uDiffOpacity;
                    // Suppress original color proportionally so red/blue stay pure
                    float suppress = intensity * 0.85;
                    tfColor.rgb = tfColor.rgb * (1.0 - suppress) + diffColor * intensity;
                    alphaCorrected = max(alphaCorrected, intensity * 0.35);
                }

                if (uShowOriginal || (uHasDiff && uShowDifference)) {
                    float ma = 1.0 - accum.a;
                    accum.rgb += ma * alphaCorrected * tfColor.rgb;
                    accum.a += ma * alphaCorrected;
                }
            }
        }
        t += uStepSize;
    }

    vec3 bgColor = vec3(1.0, 1.0, 1.0);
    accum.rgb += (1.0 - accum.a) * bgColor;
    gl_FragColor = vec4(accum.rgb, 1.0);
}
