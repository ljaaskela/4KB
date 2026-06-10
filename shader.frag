#version 430

// u.xy = resolution, u.z = time (seconds, clocked from the audio position)
layout(location = 0) uniform vec3 u;
out vec4 o;

float mode;  // 0 = sponge + dive (bars 0-6), 1 = tunnel (6-12), 2 = endless cube field (12-16)
float F;     // end-of-loop morph: 0 = full lattice, 1 = only the home cube left
float G;     // end-of-tunnel morph: walls dissolve, revealing the lattice

// winding centerline of the tunnel, threading the lattice's cube-free canyon
vec2 path(float z)
{
    return vec2(sin(z * .27) * 1.4 + 3., cos(z * .37) * 1.1 + 3.);
}

mat2 rot(float a)
{
    return mat2(cos(a), -sin(a), sin(a), cos(a));
}

// slowly tumbling menger sponge
float sponge(vec3 p)
{
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

float map(vec3 p)
{
    // the lattice: home cube at the origin, copies every 6 units
    float f = sponge(mod(p + 3., 6.) - 3.);
    if (mode == 1.) {
        // the innards: a curving cylinder, walls carved by two gyroid octaves;
        // as G rises the walls dissolve into the lattice around them
        vec3 q = p;
        q.xy -= path(q.z);
        float g = dot(sin(p * 3.), cos(p.zxy * 3.)) * .22
                + dot(sin(p * 9.), cos(p.zxy * 9.)) * .04;
        return mix((2. - length(q.xy) + g) * .5, f, G);
    }
    float d = sponge(p);
    // as F rises the lattice copies dissolve, leaving only the home cube
    if (mode > 1.5) d = mix(f, d, F);
    return d;
}

void main()
{
    vec2 uv = (gl_FragCoord.xy * 2. - u.xy) / u.y;
    float bt = u.z * 2.33333;        // beats at 140 bpm
    float cyc = mod(bt * .25, 16.);  // bar within the 16-bar cycle
    mode = step(6., cyc) + step(12., cyc);
    F = smoothstep(14.2, 15.8, cyc);   // lattice dissolve spans the break bar
    G = smoothstep(10.5, 12., cyc);    // tunnel walls dissolve before bar 12
    float T = cyc * 2.9 - 40.;         // tunnel ride ends where the field cam starts

    vec3 ro, fw;
    if (mode < .5) {
        // orbit the sponge, then dive into it: radius collapses over the
        // last two bars, vertical bob damped so the final approach is straight
        float a = u.z * .4, s = cyc * .16667;
        float r = 3.4 - 2.4 * pow(s, 5.);
        ro = vec3(r * sin(a), 1.4 * sin(u.z * .26) * (1. - s * s), -r * cos(a));
        fw = normalize(-ro);
    } else if (mode < 1.5) {
        // inside: camera follows the tunnel path, looking ahead, and
        // straightens out into the canyon drift as the walls dissolve
        ro = vec3(path(T), T);
        fw = normalize(vec3(path(T + 2.), T + 2.) - ro);
        vec3 ro2 = vec3(3. + 1.5 * sin(u.z * .3), 3. + 1.5 * cos(u.z * .23),
                        (cyc - 14.) * 2.5);
        ro = mix(ro, ro2, G);
        fw = normalize(mix(fw, vec3(.4 * sin(u.z * .13), .4 * cos(u.z * .11), 1.), G));
    } else {
        // out the far side: drift between the cube columns, then swing onto
        // the act-1 orbit as the lattice dissolves; at cyc=16 this camera
        // equals the act-1 camera at cyc=0 exactly, so the loop is seamless
        ro = vec3(3. + 1.5 * sin(u.z * .3), 3. + 1.5 * cos(u.z * .23),
                  (cyc - 14.) * 2.5);
        fw = vec3(.4 * sin(u.z * .13), .4 * cos(u.z * .11), 1.);
        float a = u.z * .4;
        vec3 ro2 = vec3(3.4 * sin(a), 1.4 * sin(u.z * .26), -3.4 * cos(a));
        ro = mix(ro, ro2, F);
        fw = normalize(mix(fw, -normalize(ro2), F));
    }
    vec3 rt = normalize(cross(fw, vec3(0, 1, 0)));
    vec3 rd = normalize(uv.x * rt + uv.y * cross(rt, fw) + 1.2 * fw);

    float t = 0., glow = 0., d, ao = 1.;
    vec3 p = ro;
    for (int i = 0; i < 100; i++) {
        p = ro + rd * t;
        d = map(p);
        // glowing core in every sponge; orbs strung along the tunnel center
        float orb, orbF = length(mod(p + 3., 6.) - 3.) - .45;
        if (mode == 1.)
            orb = mix(length(vec3(p.xy - path(p.z), mod(p.z, 3.) - 1.5)) - .05,
                      orbF, G);
        else {
            orb = length(p) - .45;
            if (mode > 1.5) orb = mix(orbF, orb, F);
        }
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
