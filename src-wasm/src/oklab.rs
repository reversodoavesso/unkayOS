/// src-wasm/src/oklab.rs
/// High-performance Oklab Manifold Color Grading Engine in Rust/WebAssembly.
/// Port of `remap_rda_palette.py` for zero-latency pixel buffer processing in unkayOS.

const LUT_RESOLUTION: usize = 1024;

pub fn validate_remap_input(
    rgba: &[u8],
    a_luts: &[f32],
    b_luts: &[f32],
    groups: usize,
    scalars: &[f32],
    strategy: u8,
    theme: u8,
) -> Result<(), &'static str> {
    if rgba.len() % 4 != 0 {
        return Err("RGBA buffer length must be a multiple of four");
    }
    if groups == 0
        || groups > 12
        || a_luts.len() != groups * LUT_RESOLUTION
        || b_luts.len() != groups * LUT_RESOLUTION
    {
        return Err("Invalid palette lookup table dimensions");
    }
    if strategy > 2
        || theme > 2
        || scalars
            .iter()
            .chain(a_luts.iter())
            .chain(b_luts.iter())
            .any(|value| !value.is_finite())
    {
        return Err("Invalid palette parameters");
    }
    Ok(())
}

#[cfg(test)]
mod validation_tests {
    use super::*;
    #[test]
    fn invalid_buffers_and_parameters_return_errors_without_panicking() {
        let lut = vec![0.0; LUT_RESOLUTION];
        assert!(validate_remap_input(&[0, 1, 2], &lut, &lut, 1, &[1.0], 0, 0).is_err());
        assert!(validate_remap_input(&[0; 4], &[], &lut, 1, &[1.0], 0, 0).is_err());
        assert!(validate_remap_input(&[0; 4], &lut, &lut, 1, &[f32::NAN], 0, 0).is_err());
        assert!(validate_remap_input(&[0; 4], &lut, &lut, 1, &[1.0], 3, 0).is_err());
        assert!(validate_remap_input(&[0; 4], &lut, &lut, 1, &[1.0], 0, 0).is_ok());
    }
}

#[inline]
fn srgb_u8_to_linear(val: u8) -> f32 {
    let c = (val as f32) / 255.0;
    if c <= 0.04045 {
        c / 12.92
    } else {
        ((c + 0.055) / 1.055).powf(2.4)
    }
}

#[inline]
fn build_srgb_lut() -> [f32; 256] {
    let mut lut = [0.0f32; 256];
    for i in 0..256 {
        lut[i] = srgb_u8_to_linear(i as u8);
    }
    lut
}

#[inline]
fn linear_to_srgb_u8(c: f32) -> u8 {
    let clamped = c.clamp(0.0, 1.0);
    let srgb = if clamped <= 0.0031308 {
        12.92 * clamped
    } else {
        1.055 * clamped.powf(1.0 / 2.4) - 0.055
    };
    (srgb.clamp(0.0, 1.0) * 255.0 + 0.5) as u8
}

#[inline]
fn linear_rgb_to_oklab(lr: f32, lg: f32, lb: f32) -> (f32, f32, f32) {
    let l = (0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
        .max(0.0)
        .cbrt();
    let m = (0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
        .max(0.0)
        .cbrt();
    let s = (0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
        .max(0.0)
        .cbrt();

    let ok_l = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
    let ok_a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    let ok_b = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;

    (ok_l, ok_a, ok_b)
}

#[inline]
fn oklab_to_srgb_u8(ok_l: f32, ok_a: f32, ok_b: f32) -> (u8, u8, u8) {
    let l_ = ok_l + 0.3963377774 * ok_a + 0.2158037573 * ok_b;
    let m_ = ok_l - 0.1055613458 * ok_a - 0.0638541728 * ok_b;
    let s_ = ok_l - 0.0894841775 * ok_a - 1.2914855480 * ok_b;

    let l = l_.max(0.0);
    let m = m_.max(0.0);
    let s = s_.max(0.0);

    let l3 = l * l * l;
    let m3 = m * m * m;
    let s3 = s * s * s;

    let lr = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
    let lg = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
    let lb = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;

    (
        linear_to_srgb_u8(lr),
        linear_to_srgb_u8(lg),
        linear_to_srgb_u8(lb),
    )
}

#[inline]
fn apply_theme_curve(l: f32, theme_code: u8) -> f32 {
    let clamped = l.clamp(0.0, 1.0);
    match theme_code {
        1 => (clamped.powf(1.35) * 0.88 + 0.04).clamp(0.0, 1.0), // dark
        2 => (clamped.powf(0.72) * 0.88 + 0.08).clamp(0.0, 1.0), // light
        _ => clamped,                                            // preserve
    }
}

/// Processes an RGBA pixel buffer in-place/out-of-place using pre-interpolated
/// Oklab group LUTs (`a_luts_flat`, `b_luts_flat` of length `num_groups * 1024`).
///
/// - `strategy_code`: 0 = affinity, 1 = relative (PCA), 2 = split-tone
/// - `theme_code`: 0 = preserve, 1 = dark, 2 = light
pub fn remap_rgba_buffer_oklab(
    rgba: &[u8],
    a_luts_flat: &[f32],
    b_luts_flat: &[f32],
    num_groups: usize,
    primary_mean_angle: f32,
    primary_chroma: f32,
    strategy_code: u8,
    theme_code: u8,
    temperature: f32,
    chroma_boost: f32,
    intensity: f32,
    align_dominant_hue: bool,
) -> Vec<u8> {
    let pixel_count = rgba.len() / 4;
    if pixel_count == 0 || num_groups == 0 {
        return rgba.to_vec();
    }

    let srgb_lut = build_srgb_lut();
    let max_lut_idx = (LUT_RESOLUTION - 1) as f32;
    let blend = intensity.clamp(0.0, 1.0);

    let mut l_orig_arr = vec![0.0f32; pixel_count];
    let mut l_arr = vec![0.0f32; pixel_count];
    let mut a_arr = vec![0.0f32; pixel_count];
    let mut b_arr = vec![0.0f32; pixel_count];
    let mut l_idx_arr = vec![0usize; pixel_count];

    let mut dom_sum_a = 0.0f32;
    let mut dom_sum_b = 0.0f32;
    let mut dom_weight_sum = 0.0f32;

    let mut mean_a = 0.0f32;
    let mut mean_b = 0.0f32;

    for i in 0..pixel_count {
        let off = i * 4;
        let lr = srgb_lut[rgba[off] as usize];
        let lg = srgb_lut[rgba[off + 1] as usize];
        let lb = srgb_lut[rgba[off + 2] as usize];

        let (ok_l, ok_a, ok_b) = linear_rgb_to_oklab(lr, lg, lb);
        let l_out = apply_theme_curve(ok_l, theme_code);

        l_orig_arr[i] = ok_l;
        l_arr[i] = l_out;
        a_arr[i] = ok_a;
        b_arr[i] = ok_b;

        let idx = (l_out * max_lut_idx + 0.5) as usize;
        l_idx_arr[i] = idx.min(LUT_RESOLUTION - 1);

        mean_a += ok_a;
        mean_b += ok_b;

        let chroma = (ok_a * ok_a + ok_b * ok_b).sqrt();
        if chroma > 0.018 {
            dom_sum_a += ok_a * chroma;
            dom_sum_b += ok_b * chroma;
            dom_weight_sum += chroma;
        }
    }

    mean_a /= pixel_count as f32;
    mean_b /= pixel_count as f32;

    let mut out = vec![0u8; rgba.len()];

    if strategy_code == 0 {
        // Strategy 0: Affinity
        let safe_temp = temperature.max(1e-4);
        let mut cos_theta = 1.0f32;
        let mut sin_theta = 0.0f32;

        if align_dominant_hue && dom_weight_sum > 1e-5 && primary_chroma > 0.015 {
            let src_angle = (dom_sum_b / dom_weight_sum).atan2(dom_sum_a / dom_weight_sum);
            let delta = primary_mean_angle - src_angle;
            cos_theta = delta.cos();
            sin_theta = delta.sin();
        }

        let mut dists = vec![0.0f32; num_groups];
        let mut weights = vec![0.0f32; num_groups];

        for i in 0..pixel_count {
            let l_idx = l_idx_arr[i];
            let raw_a = a_arr[i];
            let raw_b = b_arr[i];
            let rot_a = raw_a * cos_theta - raw_b * sin_theta;
            let rot_b = raw_a * sin_theta + raw_b * cos_theta;

            let mut min_dist = f32::INFINITY;
            for k in 0..num_groups {
                let lut_offset = k * LUT_RESOLUTION + l_idx;
                let ga = a_luts_flat[lut_offset];
                let gb = b_luts_flat[lut_offset];
                let da = rot_a - ga;
                let db = rot_b - gb;
                let d = (da * da + db * db).sqrt();
                dists[k] = d;
                if d < min_dist {
                    min_dist = d;
                }
            }

            let mut w_sum = 0.0f32;
            for k in 0..num_groups {
                let w = (-(dists[k] - min_dist) / safe_temp).exp();
                weights[k] = w;
                w_sum += w;
            }

            let mut a_mapped = 0.0f32;
            let mut b_mapped = 0.0f32;
            for k in 0..num_groups {
                let lut_offset = k * LUT_RESOLUTION + l_idx;
                let w_norm = weights[k] / w_sum;
                a_mapped += w_norm * a_luts_flat[lut_offset];
                b_mapped += w_norm * b_luts_flat[lut_offset];
            }

            let a_boosted = a_mapped * chroma_boost;
            let b_boosted = b_mapped * chroma_boost;

            let final_l = l_orig_arr[i] + blend * (l_arr[i] - l_orig_arr[i]);
            let final_a = raw_a + blend * (a_boosted - raw_a);
            let final_b = raw_b + blend * (b_boosted - raw_b);

            let (r, g, b) = oklab_to_srgb_u8(final_l, final_a, final_b);
            let off = i * 4;
            out[off] = r;
            out[off + 1] = g;
            out[off + 2] = b;
            out[off + 3] = rgba[off + 3];
        }
    } else if strategy_code == 1 {
        // Strategy 1: Relative (PCA)
        let mut cov_aa = 0.0f32;
        let mut cov_ab = 0.0f32;
        let mut cov_bb = 0.0f32;
        for i in 0..pixel_count {
            let da = a_arr[i] - mean_a;
            let db = b_arr[i] - mean_b;
            cov_aa += da * da;
            cov_ab += da * db;
            cov_bb += db * db;
        }
        let angle = 0.5 * (2.0 * cov_ab).atan2(cov_aa - cov_bb);
        let axis_a = angle.cos();
        let axis_b = angle.sin();

        let mut proj = vec![0.0f32; pixel_count];
        for i in 0..pixel_count {
            proj[i] = (a_arr[i] - mean_a) * axis_a + (b_arr[i] - mean_b) * axis_b;
        }

        let sample_step = (pixel_count / 2048).max(1);
        let mut samples: Vec<f32> = proj.iter().step_by(sample_step).copied().collect();
        samples.sort_by(|x, y| x.partial_cmp(y).unwrap_or(std::cmp::Ordering::Equal));
        let p_low = if !samples.is_empty() {
            samples[(samples.len() * 2) / 100]
        } else {
            -1.0
        };
        let p_high = if !samples.is_empty() {
            samples[((samples.len() * 98) / 100).min(samples.len() - 1)]
        } else {
            1.0
        };
        let p_span = if (p_high - p_low) > 1e-6 {
            p_high - p_low
        } else {
            1.0
        };

        let k_span = (num_groups.saturating_sub(1)).max(1) as f32;

        for i in 0..pixel_count {
            let l_idx = l_idx_arr[i];
            let t_norm = (((proj[i] - p_low) / p_span) * 2.0 - 1.0).clamp(-1.0, 1.0);
            let pos = ((t_norm + 1.0) * 0.5) * k_span;

            let (a_mapped, b_mapped) = if num_groups == 1 {
                (a_luts_flat[l_idx], b_luts_flat[l_idx])
            } else {
                let idx_low = (pos.floor() as usize).min(num_groups - 2);
                let idx_high = idx_low + 1;
                let frac = pos - (idx_low as f32);
                let off_low = idx_low * LUT_RESOLUTION + l_idx;
                let off_high = idx_high * LUT_RESOLUTION + l_idx;
                (
                    (1.0 - frac) * a_luts_flat[off_low] + frac * a_luts_flat[off_high],
                    (1.0 - frac) * b_luts_flat[off_low] + frac * b_luts_flat[off_high],
                )
            };

            let a_boosted = a_mapped * chroma_boost;
            let b_boosted = b_mapped * chroma_boost;
            let raw_a = a_arr[i];
            let raw_b = b_arr[i];

            let final_l = l_orig_arr[i] + blend * (l_arr[i] - l_orig_arr[i]);
            let final_a = raw_a + blend * (a_boosted - raw_a);
            let final_b = raw_b + blend * (b_boosted - raw_b);

            let (r, g, b) = oklab_to_srgb_u8(final_l, final_a, final_b);
            let off = i * 4;
            out[off] = r;
            out[off + 1] = g;
            out[off + 2] = b;
            out[off + 3] = rgba[off + 3];
        }
    } else {
        // Strategy 2: Split-Tone (reversed groups)
        let k_span = (num_groups.saturating_sub(1)).max(1) as f32;
        for i in 0..pixel_count {
            let l_idx = l_idx_arr[i];
            let l_out = l_arr[i];

            let (a_mapped, b_mapped) = if num_groups == 1 {
                (a_luts_flat[l_idx], b_luts_flat[l_idx])
            } else {
                let pos = l_out * k_span;
                let rev_low = (pos.floor() as usize).min(num_groups - 2);
                let rev_high = rev_low + 1;
                let frac = pos - (rev_low as f32);
                // Reversed LUT index
                let orig_low = num_groups - 1 - rev_low;
                let orig_high = num_groups - 1 - rev_high;
                let off_low = orig_low * LUT_RESOLUTION + l_idx;
                let off_high = orig_high * LUT_RESOLUTION + l_idx;
                (
                    (1.0 - frac) * a_luts_flat[off_low] + frac * a_luts_flat[off_high],
                    (1.0 - frac) * b_luts_flat[off_low] + frac * b_luts_flat[off_high],
                )
            };

            let a_boosted = a_mapped * chroma_boost;
            let b_boosted = b_mapped * chroma_boost;
            let raw_a = a_arr[i];
            let raw_b = b_arr[i];

            let final_l = l_orig_arr[i] + blend * (l_out - l_orig_arr[i]);
            let final_a = raw_a + blend * (a_boosted - raw_a);
            let final_b = raw_b + blend * (b_boosted - raw_b);

            let (r, g, b) = oklab_to_srgb_u8(final_l, final_a, final_b);
            let off = i * 4;
            out[off] = r;
            out[off + 1] = g;
            out[off + 2] = b;
            out[off + 3] = rgba[off + 3];
        }
    }

    out
}
