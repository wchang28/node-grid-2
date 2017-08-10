'use strict';

module.exports = function(grunt) {

  grunt.initConfig({
    ts: {
      all: { tsconfig: true }
    },
    browserify: {
      all:{
        src: './js/ui/main.js',
        dest: './public/js/bundle.js',
      }
    },
  });

  grunt.loadNpmTasks("grunt-ts");
  grunt.loadNpmTasks("grunt-browserify");
  grunt.registerTask("default",["ts","browserify"])
}
