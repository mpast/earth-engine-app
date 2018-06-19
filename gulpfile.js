'use strict';

var autoprefixer = require('gulp-autoprefixer');
var csso = require('gulp-csso');
var del = require('del');
var gulp = require('gulp');
var htmlmin = require('gulp-htmlmin');
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
        .pipe(autoprefixer({ browsers: AUTOPREFIXER_BROWSERS }))
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
        .pipe(htmlmin({
            collapseWhitespace: true,
            removeComments: true
        }))
        .pipe(gulp.dest('./templates'));
});

//Clean output directory
gulp.task('clean', () => del(['./static/css', './static/js', './templates']));

//Gulp task to minify all files
gulp.task('run', ['clean', 'styles', 'scripts', 'templates']);
//Gulp task to watch changes and minify all files
gulp.task('watch', function() {
    gulp.watch('./src/css/*.css', ['styles']);
    gulp.watch('./src/js/*.js', ['scripts']);
    gulp.watch('./src/templates/*.html', ['templates']);
});

//Gulp tasks by default
gulp.task('default', ['run', 'watch']);