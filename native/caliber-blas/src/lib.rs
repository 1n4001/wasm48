//! BLAS-style kernels for Caliber 48.
//!
//! DGEMM is the `matrixmultiply` crate (the same GEMM ndarray uses), compiled
//! into this wasm module. Level 1, GEMV, and the small drivers (inverse,
//! determinant) live here so the MATLAB compiler can call a stable C ABI.

use matrixmultiply::dgemm as mm_dgemm;

const ARENA_LEN: usize = 32_768;

static mut ARENA: Vec<f64> = Vec::new();
static mut USED: usize = 0;
/// 0 = radians, 1 = degrees.
static mut ANGLE: i32 = 0;

fn rad_in(x: f64) -> f64 {
    unsafe {
        if ANGLE == 1 {
            x.to_radians()
        } else {
            x
        }
    }
}

fn rad_out(x: f64) -> f64 {
    unsafe {
        if ANGLE == 1 {
            x.to_degrees()
        } else {
            x
        }
    }
}

#[no_mangle]
pub extern "C" fn blas_init() {
    unsafe {
        if ARENA.is_empty() {
            ARENA = vec![0.0; ARENA_LEN];
        }
        USED = 0;
    }
}

#[no_mangle]
pub extern "C" fn reset_arena() {
    unsafe {
        USED = 0;
    }
}

/// Bump-allocate `n` floats from the session arena. Returns null on overflow.
#[no_mangle]
pub extern "C" fn alloc_f64(n: i32) -> *mut f64 {
    if n < 0 {
        return std::ptr::null_mut();
    }
    let n = n as usize;
    unsafe {
        if ARENA.is_empty() {
            blas_init();
        }
        if USED + n > ARENA.len() {
            return std::ptr::null_mut();
        }
        let p = ARENA.as_mut_ptr().add(USED);
        USED += n;
        p
    }
}

#[no_mangle]
pub extern "C" fn set_angle(mode: i32) {
    unsafe {
        ANGLE = if mode == 0 { 0 } else { 1 };
    }
}

#[no_mangle]
pub extern "C" fn get_angle() -> i32 {
    unsafe { ANGLE }
}

#[no_mangle]
pub unsafe extern "C" fn ddot(n: i32, x: *const f64, incx: i32, y: *const f64, incy: i32) -> f64 {
    if n <= 0 {
        return 0.0;
    }
    let mut s = 0.0;
    let mut ix = 0isize;
    let mut iy = 0isize;
    for _ in 0..n {
        s += *x.offset(ix) * *y.offset(iy);
        ix += incx as isize;
        iy += incy as isize;
    }
    s
}

#[no_mangle]
pub unsafe extern "C" fn dnrm2(n: i32, x: *const f64, incx: i32) -> f64 {
    if n <= 0 {
        return 0.0;
    }
    let mut scale = 0.0;
    let mut ssq = 1.0;
    let mut ix = 0isize;
    for _ in 0..n {
        let v = (*x.offset(ix)).abs();
        if v != 0.0 {
            if scale < v {
                let r = scale / v;
                ssq = 1.0 + ssq * r * r;
                scale = v;
            } else {
                let r = v / scale;
                ssq += r * r;
            }
        }
        ix += incx as isize;
    }
    scale * ssq.sqrt()
}

#[no_mangle]
pub unsafe extern "C" fn daxpy(n: i32, alpha: f64, x: *const f64, incx: i32, y: *mut f64, incy: i32) {
    if n <= 0 || alpha == 0.0 {
        return;
    }
    let mut ix = 0isize;
    let mut iy = 0isize;
    for _ in 0..n {
        *y.offset(iy) += alpha * *x.offset(ix);
        ix += incx as isize;
        iy += incy as isize;
    }
}

#[no_mangle]
pub unsafe extern "C" fn dscal(n: i32, alpha: f64, x: *mut f64, incx: i32) {
    if n <= 0 {
        return;
    }
    let mut ix = 0isize;
    for _ in 0..n {
        *x.offset(ix) *= alpha;
        ix += incx as isize;
    }
}

#[no_mangle]
pub unsafe extern "C" fn dcopy(n: i32, x: *const f64, incx: i32, y: *mut f64, incy: i32) {
    if n <= 0 {
        return;
    }
    let mut ix = 0isize;
    let mut iy = 0isize;
    for _ in 0..n {
        *y.offset(iy) = *x.offset(ix);
        ix += incx as isize;
        iy += incy as isize;
    }
}

/// y := alpha * A * x + beta * y. A is m×n, column-major, leading dimension `lda`.
#[no_mangle]
pub unsafe extern "C" fn dgemv(
    m: i32,
    n: i32,
    alpha: f64,
    a: *const f64,
    lda: i32,
    x: *const f64,
    incx: i32,
    beta: f64,
    y: *mut f64,
    incy: i32,
) {
    if m <= 0 || n < 0 {
        return;
    }
    let m = m as usize;
    let n = n as usize;
    let lda = lda as usize;
    if beta != 1.0 {
        let mut iy = 0isize;
        for _ in 0..m {
            *y.offset(iy) *= beta;
            iy += incy as isize;
        }
    }
    if alpha == 0.0 {
        return;
    }
    for j in 0..n {
        let ax = alpha * *x.offset((j as isize) * (incx as isize));
        if ax == 0.0 {
            continue;
        }
        let col = a.add(j * lda);
        let mut iy = 0isize;
        for i in 0..m {
            *y.offset(iy) += ax * *col.add(i);
            iy += incy as isize;
        }
    }
}

/// C := alpha * A * B + beta * C.
/// A is m×k (lda), B is k×n (ldb), C is m×n (ldc), all column-major.
/// DGEMM itself is `matrixmultiply::dgemm`.
#[no_mangle]
pub unsafe extern "C" fn dgemm(
    m: i32,
    n: i32,
    k: i32,
    alpha: f64,
    a: *const f64,
    lda: i32,
    b: *const f64,
    ldb: i32,
    beta: f64,
    c: *mut f64,
    ldc: i32,
) {
    if m <= 0 || n <= 0 || k < 0 {
        return;
    }
    mm_dgemm(
        m as usize,
        k as usize,
        n as usize,
        alpha,
        a,
        1,
        lda as isize,
        b,
        1,
        ldb as isize,
        beta,
        c,
        1,
        ldc as isize,
    );
}

#[no_mangle]
pub unsafe extern "C" fn blit(
    rows: i32,
    cols: i32,
    src: *const f64,
    dest: *mut f64,
    dest_rows: i32,
    row_off: i32,
    col_off: i32,
) {
    let rows = rows as usize;
    let cols = cols as usize;
    let dest_rows = dest_rows as usize;
    let row_off = row_off as usize;
    let col_off = col_off as usize;
    for j in 0..cols {
        for i in 0..rows {
            *dest.add((row_off + i) + (col_off + j) * dest_rows) = *src.add(i + j * rows);
        }
    }
}

#[no_mangle]
pub unsafe extern "C" fn transpose(m: i32, n: i32, a: *const f64, lda: i32, c: *mut f64, ldc: i32) {
    let m = m as usize;
    let n = n as usize;
    let lda = lda as usize;
    let ldc = ldc as usize;
    for j in 0..n {
        for i in 0..m {
            *c.add(j + i * ldc) = *a.add(i + j * lda);
        }
    }
}

fn apply_unop(op: i32, x: f64) -> f64 {
    match op {
        0 => rad_in(x).sin(),
        1 => rad_in(x).cos(),
        2 => rad_in(x).tan(),
        3 => rad_out(x.asin()),
        4 => rad_out(x.acos()),
        5 => rad_out(x.atan()),
        6 => x.sinh(),
        7 => x.cosh(),
        8 => x.tanh(),
        9 => x.exp(),
        10 => x.ln(),
        11 => x.log10(),
        12 => x.sqrt(),
        13 => x.abs(),
        14 => x.floor(),
        15 => x.ceil(),
        16 => x.round(),
        17 => -x,
        18 => 1.0 / x,
        _ => f64::NAN,
    }
}

fn apply_binop(op: i32, a: f64, b: f64) -> f64 {
    match op {
        0 => a + b,
        1 => a - b,
        2 => a * b,
        3 => a / b,
        4 => a.powf(b),
        _ => f64::NAN,
    }
}

#[no_mangle]
pub unsafe extern "C" fn ew_unop(n: i32, x: *const f64, y: *mut f64, op: i32) {
    for i in 0..n as usize {
        *y.add(i) = apply_unop(op, *x.add(i));
    }
}

#[no_mangle]
pub unsafe extern "C" fn ew_binop(n: i32, a: *const f64, b: *const f64, c: *mut f64, op: i32) {
    for i in 0..n as usize {
        *c.add(i) = apply_binop(op, *a.add(i), *b.add(i));
    }
}

/// y[i] = x[i] + alpha
#[no_mangle]
pub unsafe extern "C" fn add_scalar(n: i32, x: *const f64, alpha: f64, y: *mut f64) {
    for i in 0..n as usize {
        *y.add(i) = *x.add(i) + alpha;
    }
}

/// y[i] = alpha * x[i]
#[no_mangle]
pub unsafe extern "C" fn scale_copy(n: i32, alpha: f64, x: *const f64, y: *mut f64) {
    for i in 0..n as usize {
        *y.add(i) = alpha * *x.add(i);
    }
}

#[no_mangle]
pub unsafe extern "C" fn fill(n: i32, a: *mut f64, v: f64) {
    for i in 0..n as usize {
        *a.add(i) = v;
    }
}

#[no_mangle]
pub unsafe extern "C" fn eye(rows: i32, cols: i32, a: *mut f64) {
    let rows = rows as usize;
    let cols = cols as usize;
    for j in 0..cols {
        for i in 0..rows {
            *a.add(i + j * rows) = if i == j { 1.0 } else { 0.0 };
        }
    }
}

/// Row vector of `n` values starting at `start`, stepping by `step`, contiguous.
#[no_mangle]
pub unsafe extern "C" fn range_row(start: f64, step: f64, n: i32, a: *mut f64) {
    for i in 0..n as usize {
        *a.add(i) = start + (i as f64) * step;
    }
}

#[no_mangle]
pub unsafe extern "C" fn sum_all(n: i32, x: *const f64) -> f64 {
    let mut s = 0.0;
    for i in 0..n as usize {
        s += *x.add(i);
    }
    s
}

/// Column sums of an m×n packed matrix. `out` has length n.
#[no_mangle]
pub unsafe extern "C" fn sum_cols(m: i32, n: i32, a: *const f64, out: *mut f64) {
    let m = m as usize;
    let n = n as usize;
    for j in 0..n {
        let mut s = 0.0;
        for i in 0..m {
            s += *a.add(i + j * m);
        }
        *out.add(j) = s;
    }
}

#[no_mangle]
pub unsafe extern "C" fn trace(n: i32, a: *const f64) -> f64 {
    let n = n as usize;
    let mut s = 0.0;
    for i in 0..n {
        s += *a.add(i + i * n);
    }
    s
}

#[no_mangle]
pub unsafe extern "C" fn diag_of(m: i32, n: i32, a: *const f64, out: *mut f64) -> i32 {
    let len = m.min(n) as usize;
    let m = m as usize;
    for i in 0..len {
        *out.add(i) = *a.add(i + i * m);
    }
    len as i32
}

#[no_mangle]
pub unsafe extern "C" fn diag_mat(n: i32, v: *const f64, out: *mut f64) {
    let n = n as usize;
    for j in 0..n {
        for i in 0..n {
            *out.add(i + j * n) = if i == j { *v.add(i) } else { 0.0 };
        }
    }
}

#[no_mangle]
pub unsafe extern "C" fn cross3(a: *const f64, b: *const f64, c: *mut f64) {
    let a0 = *a;
    let a1 = *a.add(1);
    let a2 = *a.add(2);
    let b0 = *b;
    let b1 = *b.add(1);
    let b2 = *b.add(2);
    *c = a1 * b2 - a2 * b1;
    *c.add(1) = a2 * b0 - a0 * b2;
    *c.add(2) = a0 * b1 - a1 * b0;
}

/// Inverse via Gauss-Jordan with partial pivoting. `a` and `out` are n×n packed.
/// Returns 0, or 1 if singular, or 2 if n is out of range.
#[no_mangle]
pub unsafe extern "C" fn inv(n: i32, a: *const f64, out: *mut f64) -> i32 {
    if n <= 0 || n > 16 {
        return 2;
    }
    let n = n as usize;
    let mut aug = vec![0.0; n * 2 * n];
    for j in 0..n {
        for i in 0..n {
            aug[i + j * n] = *a.add(i + j * n);
            aug[i + (n + j) * n] = if i == j { 1.0 } else { 0.0 };
        }
    }
    for col in 0..n {
        let mut piv = col;
        let mut maxv = aug[col + col * n].abs();
        for r in (col + 1)..n {
            let v = aug[r + col * n].abs();
            if v > maxv {
                maxv = v;
                piv = r;
            }
        }
        if maxv < 1e-12 {
            return 1;
        }
        if piv != col {
            for j in 0..(2 * n) {
                aug.swap(col + j * n, piv + j * n);
            }
        }
        let diag = aug[col + col * n];
        for j in 0..(2 * n) {
            aug[col + j * n] /= diag;
        }
        for r in 0..n {
            if r == col {
                continue;
            }
            let factor = aug[r + col * n];
            if factor == 0.0 {
                continue;
            }
            for j in 0..(2 * n) {
                let v = aug[r + j * n] - factor * aug[col + j * n];
                aug[r + j * n] = v;
            }
        }
    }
    for j in 0..n {
        for i in 0..n {
            *out.add(i + j * n) = aug[i + (n + j) * n];
        }
    }
    0
}

#[no_mangle]
pub unsafe extern "C" fn det(n: i32, a: *const f64) -> f64 {
    if n <= 0 || n > 16 {
        return f64::NAN;
    }
    let n = n as usize;
    let mut m = vec![0.0; n * n];
    for i in 0..(n * n) {
        m[i] = *a.add(i);
    }
    let mut sign = 1.0;
    let mut d = 1.0;
    for col in 0..n {
        let mut piv = col;
        let mut maxv = m[col + col * n].abs();
        for r in (col + 1)..n {
            let v = m[r + col * n].abs();
            if v > maxv {
                maxv = v;
                piv = r;
            }
        }
        if maxv < 1e-12 {
            return 0.0;
        }
        if piv != col {
            for j in 0..n {
                m.swap(col + j * n, piv + j * n);
            }
            sign = -sign;
        }
        let diag = m[col + col * n];
        d *= diag;
        for r in (col + 1)..n {
            let factor = m[r + col * n] / diag;
            for j in col..n {
                let v = m[r + j * n] - factor * m[col + j * n];
                m[r + j * n] = v;
            }
        }
    }
    sign * d
}

#[no_mangle]
pub extern "C" fn fadd(a: f64, b: f64) -> f64 {
    a + b
}
#[no_mangle]
pub extern "C" fn fsub(a: f64, b: f64) -> f64 {
    a - b
}
#[no_mangle]
pub extern "C" fn fmul(a: f64, b: f64) -> f64 {
    a * b
}
#[no_mangle]
pub extern "C" fn fdiv(a: f64, b: f64) -> f64 {
    a / b
}
#[no_mangle]
pub extern "C" fn fpow(a: f64, b: f64) -> f64 {
    a.powf(b)
}
#[no_mangle]
pub extern "C" fn fsqrt(a: f64) -> f64 {
    a.sqrt()
}
#[no_mangle]
pub extern "C" fn fsin(a: f64) -> f64 {
    rad_in(a).sin()
}
#[no_mangle]
pub extern "C" fn fcos(a: f64) -> f64 {
    rad_in(a).cos()
}
#[no_mangle]
pub extern "C" fn ftan(a: f64) -> f64 {
    rad_in(a).tan()
}
#[no_mangle]
pub extern "C" fn fasin(a: f64) -> f64 {
    rad_out(a.asin())
}
#[no_mangle]
pub extern "C" fn facos(a: f64) -> f64 {
    rad_out(a.acos())
}
#[no_mangle]
pub extern "C" fn fatan(a: f64) -> f64 {
    rad_out(a.atan())
}
#[no_mangle]
pub extern "C" fn fsinh(a: f64) -> f64 {
    a.sinh()
}
#[no_mangle]
pub extern "C" fn fcosh(a: f64) -> f64 {
    a.cosh()
}
#[no_mangle]
pub extern "C" fn ftanh(a: f64) -> f64 {
    a.tanh()
}
#[no_mangle]
pub extern "C" fn fexp(a: f64) -> f64 {
    a.exp()
}
#[no_mangle]
pub extern "C" fn fln(a: f64) -> f64 {
    a.ln()
}
#[no_mangle]
pub extern "C" fn flog10(a: f64) -> f64 {
    a.log10()
}
#[no_mangle]
pub extern "C" fn fabs(a: f64) -> f64 {
    a.abs()
}
#[no_mangle]
pub extern "C" fn ffloor(a: f64) -> f64 {
    a.floor()
}
#[no_mangle]
pub extern "C" fn fceil(a: f64) -> f64 {
    a.ceil()
}
#[no_mangle]
pub extern "C" fn fround(a: f64) -> f64 {
    a.round()
}
#[no_mangle]
pub extern "C" fn fneg(a: f64) -> f64 {
    -a
}
#[no_mangle]
pub extern "C" fn finv(a: f64) -> f64 {
    1.0 / a
}

#[no_mangle]
pub extern "C" fn ffact(a: f64) -> f64 {
    if a < 0.0 || a > 170.0 || a.fract() != 0.0 {
        return f64::NAN;
    }
    let n = a as i32;
    let mut acc = 1.0;
    let mut i = 2;
    while i <= n {
        acc *= i as f64;
        i += 1;
    }
    acc
}
