'use strict';

const autoprefixer = require('gulp-autoprefixer').default;
var csso = require('gulp-csso');
const { deleteAsync } = require('del');
var gulp = require('gulp');
const { minify } = require('html-minifier-terser');
const { Transform } = require('node:stream');
var uglify = require('gulp-uglify');

const AUTOPREFIXER_BROWSERS = [
    'ie >= 10',
    'ie_mob >= 10',
    'ff >= 30',
    'chrome >= 34',
    'safari >= 7',
    'opera >= 23',
    'ios >= 7',
    'android >= 4.4',
    'bb >= 10'
];

//Gulp task to minify styles files
gulp.task('styles', function() {
    return gulp.src('./src/css/*.css')
        // Auto-prefix css styles for cross browser compatibility
        .pipe(autoprefixer({ overrideBrowserslist: AUTOPREFIXER_BROWSERS }))
        // Minify the file
        .pipe(csso())
        // Output
        .pipe(gulp.dest('./static/css'))
});

//Gulp task to minify script files
gulp.task('scripts', function() {
    return gulp.src('./src/js/*.js')
        // Minify the file
        .pipe(uglify())
        // Output
        .pipe(gulp.dest('./static/js'))
});

//Gulp task to minify HTML files
gulp.task('templates', function() {
    return gulp.src(['./src/templates/*.html'])
        .pipe(new Transform({
            objectMode: true,
            transform(file, encoding, callback) {
                minify(file.contents.toString(), { collapseWhitespace: true, removeComments: true })
                    .then(html => { file.contents = Buffer.from(html); callback(null, file); }, callback);
            }
        }))
        .pipe(gulp.dest('./templates'));
});

//Clean output directory
gulp.task('clean', () => deleteAsync(['./static/css/*', './static/js/*', './templates/*'], { onlyFiles: true }));

//Gulp task to minify all files
gulp.task('run', gulp.series('clean', gulp.parallel('styles', 'scripts', 'templates')));
//Gulp task to watch changes and minify all files
gulp.task('watch', function() {
    gulp.watch('./src/css/*.css', gulp.series('styles'));
    gulp.watch('./src/js/*.js', gulp.series('scripts'));
    gulp.watch('./src/templates/*.html', gulp.series('templates'));
});

//Gulp tasks by default
gulp.task('default', gulp.series('run', 'watch'));
