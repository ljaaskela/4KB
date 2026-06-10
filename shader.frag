#version 430

// u.xy = resolution, u.z = time (seconds, clocked from the audio position)
layout(location = 0) uniform vec3 u;
out vec4 o;

float mode;  // 0 = menger sponge (bars 0-8), 1 = tunnel inside it (bars 8-16)

// winding path of the tunnel centerline
vec2 path(float z)
{
    return vec2(sin(z * .27) * 1.4, cos(z * .37) * 1.1);
}

mat2 rot(float a)
{
    return mat2(cos(a), -sin(a), sin(a), cos(a));
}

float map(vec3 p)
{
    if (mode > .5) {
        // the innards: a curving cylinder, walls carved by two gyroid octaves
        p.xy -= path(p.z);
        float g = dot(sin(p * 3.), cos(p.zxy * 3.)) * .22
                + dot(sin(p * 9.), cos(p.zxy * 9.)) * .04;
        return (2. - length(p.xy) + g) * .5;
    }
    // slowly tumbling menger sponge
    p.xy *= rot(u.z * .23);
    p.xz *= rot(u.z * .31);
    float d = max(abs(p.x), max(abs(p.y), abs(p.z))) - 1.;
    float s = 1.;
    for (int i = 0; i < 4; i++) {
        vec3 a = mod(p * s, 2.) - 1.;
        s *= 3.;
        vec3 r = abs(1. - 3. * abs(a));
        d = max(d, (min(max(r.x, r.y), min(max(r.y, r.z), max(r.z, r.x))) - 1.) / s);
    }
    return d;
}

void main()
{
    vec2 uv = (gl_FragCoord.xy * 2. - u.xy) / u.y;
    float bt = u.z * 2.33333;        // beats at 140 bpm
    float cyc = mod(bt * .25, 16.);  // bar within the 16-bar cycle
    mode = step(8., cyc);
    float T = u.z * 1.7;

    vec3 ro, fw;
    if (mode < .5) {
        // orbit the sponge, then dive into it: radius collapses over the
        // last two bars, vertical bob damped so the final approach is straight
        float a = u.z * .4, s = cyc * .125;
        float r = 3.4 - 2.4 * pow(s, 5.);
        ro = vec3(r * sin(a), 1.4 * sin(u.z * .26) * (1. - s * s), -r * cos(a));
        fw = normalize(-ro);
    } else {
        // inside: camera follows the tunnel path, looking ahead
        ro = vec3(path(T), T);
        fw = normalize(vec3(path(T + 2.), T + 2.) - ro);
    }
    vec3 rt = normalize(cross(fw, vec3(0, 1, 0)));
    vec3 rd = normalize(uv.x * rt + uv.y * cross(rt, fw) + 1.2 * fw);

    float t = 0., glow = 0., d, ao = 1.;
    vec3 p = ro;
    for (int i = 0; i < 100; i++) {
        p = ro + rd * t;
        d = map(p);
        // sponge: glowing core; tunnel: orbs strung along the center
        vec3 q = mode < .5 ? p : vec3(p.xy - path(p.z), mod(p.z, 3.) - 1.5);
        float orb = length(q) - (mode < .5 ? .45 : .05);
        glow += .014 / (.015 + orb * orb);
        if (d < .002 || t > 30.) break;
        t += d;
        ao = 1. - float(i) / 90.;
    }

    vec2 e = vec2(.001, 0);
    vec3 n = normalize(vec3(
        map(p + e.xyy) - map(p - e.xyy),
        map(p + e.yxy) - map(p - e.yxy),
        map(p + e.yyx) - map(p - e.yyx)));

    // saturated hue drifting along the depth axis
    vec3 col = .54 + .46 * cos(p.z * .5 + vec3(0, 2.1, 4.2));
    float l = max(dot(n, -rd), 0.);
    col *= (l * l * 1.2 + .04) * ao * ao;    // hard headlight + crevice darkening
    col *= exp(-t * .17);                    // fog
    col += (vec3(.25, .5, 1.) + col) * glow * .22;  // hot glow tinted by surface
    // kick-synced flash, silent on the break bar (15 of 16)
    col *= 1. + .45 * exp(-fract(bt) * 7.)
                    * step(.5, abs(mod(floor(bt * .25), 16.) - 15.));
    col = 1. - exp(-col * 2.5);              // filmic-ish tonemap
    o = vec4(pow(col, vec3(.45)), 1);
}
