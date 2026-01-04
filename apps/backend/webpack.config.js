const TerserPlugin = require("terser-webpack-plugin");

module.exports = function (options, webpack) {
  const isProduction = process.env.NODE_ENV === "production";

  return {
    ...options,
    optimization: {
      ...options.optimization,
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            compress: {
              // Production'da console.log'larni olib tashlash
              drop_console: isProduction ? ["log"] : false, // faqat console.log
              // console.error va console.warn saqlanadi
            },
          },
        }),
      ],
    },
  };
};
